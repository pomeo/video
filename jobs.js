'use strict';
const fs        = require('fs');
const path      = require('path');
const mongoose  = require('mongoose');
const kue       = require('kue');
const queue     = kue.createQueue({
  jobEvents: false,
  redis: {
    host: process.env.redis,
  },
});
const as        = require('async');
const youtubedl = require('youtube-dl');
const cc        = require('coupon-code');
const rest      = require('restler-promises');
const FB        = require('fb');
const country   = require('./libs/country');
const Agenda    = require('agenda');
const agenda    = new Agenda({
  db: {
    address: `${process.env.mongo}/video`,
  },
});
const log       = require('winston-logs')(require('./config/log'));

FB.setAccessToken(process.env.facebookAccessToken);

function errorNotify(params) {
  const errid = cc.generate({
    parts: 1,
    partLen: 6,
  });
  log.error(`${errid} Error: ${JSON.stringify(params.err)}`);
  if (params.rest) {
    log.error(`${errid} ${params.rest}`);
  }
  log.error(`${errid} ${params.msg}`);
  throw new Error(`Ошибка: #${errid}`);
}

const modelsPath = `${__dirname}/models`;
fs.readdirSync(modelsPath).forEach(file => {
  if (~file.indexOf('js')) {
    require(`${modelsPath}/${file}`);
  }
});

const Tasks  = mongoose.model('Tasks');
const Videos = mongoose.model('Videos');

queue.watchStuckJobs();

agenda.define('tasks', {
  concurrency: 1,
}, (job, done) => {
  log.info('Agenda check tasks');
  Tasks.aggregate([{
    $match: {
      status: {
        $in: [1, 2],
      },
    },
  }, {
    $group: {
      _id: {
        type: '$type',
      },
      date: {
        $min: '$created_at',
      },
    },
  }, {
    $sort: {
      _id: -1,
    },
  }, {
    $limit: 1,
  }], (err, result) => {
    if (err) {
      errorNotify({
        msg: 'Error when check new tasks',
        err,
      });
      done();
    } else {
      Tasks.find({
        type: result[0]._id.type,
      }).find({
        created_at: result[0].date,
      }).exec((err, tasks) => {
        if (err) {
          errorNotify({
            msg: 'Error when get task',
            err,
          });
          done();
        } else {
          const task = tasks[0];
          log.info(`Fetch task ${task}`);
          if (task.status === 1) {
            task.status = 2;
            task.updated_at = new Date();
            task.save(err => {
              if (err) {
                errorNotify({
                  msg: `${task._id} Error when change status to 2`,
                  err,
                });
                done();
              } else {
                log.info(`${task._id} change status to 2`);
                queue.create('Jobs', {
                  taskid: task._id,
                  type: task.type,
                  country: task.country,
                  date: task.date,
                  video: task.video,
                  category: task.category,
                }).attempts(3)
                  .priority('normal')
                  .removeOnComplete(true)
                  .ttl(15000)
                  .save();
                done();
              }
            });
          } else if (task.status === 2) {
            if (task.count === 3) {
              task.status = 3;
              task.updated_at = new Date();
              task.save(err => {
                if (err) {
                  errorNotify({
                    msg: `${task._id} Error when change status to 3`,
                    err,
                  });
                  done();
                } else {
                  log.info(`${task._id} Close task, limit of attempts`);
                  done();
                }
              });
            } else {
              const hours = Math.abs(new Date() - new Date(task.updated_at)) / 36e5;
              if (hours > 0.5) {
                task.status = 1;
                task.count += 1;
                task.updated_at = new Date();
                task.save(err => {
                  if (err) {
                    errorNotify({
                      msg: `${task._id} Error when rerun task, status to 1, count ${task.count}`,
                      err,
                    });
                    done();
                  } else {
                    log.info(`${task._id} Rerun task, attempt: ${task.count}`);
                    done();
                  }
                });
              } else {
                done();
              }
            }
          } else {
            done();
          }
        }
      });
    }
  });
});

agenda.on('ready', () => {
  agenda.every('30 seconds', 'tasks');
  agenda.start();
});

queue.on('error', err => {
  log.error(`Error in kue: ${JSON.stringify(err)}`);
});

function graceful() {
  agenda.stop(() => {
    queue.shutdown(5000, err => {
      log.warn('Agenda and redis.io are shutdown', err || '');
      process.exit(0);
    });
  });
}

process.on('SIGTERM', graceful);
process.on('SIGINT', graceful);

function getHotVideos(job, done) {
  rest.post('https://www.google.com/trends/hotvideos/hotItems', {
    data: {
      hvd: job.data.date,
      geo: job.data.country,
      mob: '0',
      hvsm: '1',
    },
  }).then(response => {
    as.each(JSON.parse(response.data).videoList, (video, callback) => {
      const task = new Tasks({
        type: 2,
        status: 1,
        video: video.id,
        country: job.data.country,
        date: job.data.date,
        created_at: new Date(),
        updated_at: new Date(),
      });
      task.save(err => {
        if (err) {
          log.error(`${job.data.taskid} error when create new task gethotvideos ${err}`);
          callback();
        } else {
          log.info(`${job.data.taskid} create type 2 task ${video.id}`);
          callback();
        }
      });
    }, err => {
      if (err) {
        log.error(`${job.data.taskid} error async gethotvideos ${err}`);
        done(err);
      } else {
        log.info(`${job.data.taskid} finish ${job.data.date} ${job.data.country}`);
        createJobCloseTask(job.data.taskid);
        done();
      }
    });
  }).catch(err => {
    log.error(err);
    done(err);
  });
}

function getVideoInfo(job, done) {
  log.info(`${job.data.taskid} get video info`);
  Videos.findOne({
    videoid: job.data.video,
  }, (err, video) => {
    if (err) {
      log.error(`${job.data.taskid} Error: ${err}`);
      done(err);
    } else {
      if (video === null) {
        rest.get('https://www.googleapis.com/youtube/v3/videos', {
          query: {
            key: process.env.youtube,
            fields: 'items(snippet(title,description,tags))',
            part: 'snippet',
            id: job.data.video,
          },
        }).then(response => {
          log.info(`${job.data.taskid} ${job.data.video} ${JSON.stringify(response.data.items[0].snippet)}`);
          let tags = `@${country[job.data.country].en.toLowerCase()}`;
          as.each(response.data.items[0].snippet.tags, (tag, callback) => {
            tags += ` @${tag.toLowerCase()}`;
            callback();
          }, err => {
            if (err) {
              log.error(`${job.data.taskid} ${job.data.video} async tags ${err}`);
              done(err);
            } else {
              const v = new Videos({
                videoid: job.data.video,
                title: response.data.items[0].snippet.title,
                description: response.data.items[0].snippet.description,
                tags,
                downloaded: false,
                uploaded: false,
                created_at: new Date(),
                updated_at: new Date(),
              });
              v.save(err => {
                if (err) {
                  log.error(`${job.data.taskid} error when save video info ${err}`);
                  done(err);
                } else {
                  log.info(`${job.data.taskid} finish get video info ${job.data.video}`);
                  queue.create('Jobs', {
                    taskid: job.data.taskid,
                    type: 3,
                    video: job.data.video,
                    date: job.data.date,
                  }).attempts(3)
                    .priority('normal')
                    .removeOnComplete(true)
                    .save();
                  done();
                }
              });
            }
          });
        }).catch(err => {
          log.error(`${job.data.taskid} ${job.data.video} error get video info ${err}`);
          done(err);
        });
      } else {
        createJobCloseTask(job.data.taskid);
        done();
      }
    }
  });
}

function downloadVideo(job, done) {
  const cwd = `${__dirname}/public/files/${job.data.date}`;
  fs.exists(cwd, exists => {
    if (!exists) {
      fs.mkdir(cwd, err => {
        if (err) {
          log.error(`${job.data.taskid} Error: ${err}`);
          done(err);
        } else {
          log.info(`${job.data.taskid} create folder ${job.data.date}`);
        }
      });
    }
  });

  const video = youtubedl(`http://www.youtube.com/watch?v=${job.data.video}`, ['--format=best'], {
    cwd,
  });

  video.on('info', (info) => {
    log.info('Download started');
    log.info(`Filename: ${info._filename}`);
    log.info(`Size: ${info.size}`);
  });

  video.pipe(fs.createWriteStream(path.join(cwd, `${job.data.video}.mp4`)));

  video.on('end', () => {
    log.info(`${job.data.taskid} Finished downloading! ${job.data.video}`);
    Videos.findOne({
      videoid: job.data.video,
    }, (err, video) => {
      if (err) {
        log.error(`${job.data.taskid} Error: ${err}`);
        done(err);
      } else {
        video.downloaded = true;
        video.updated_at = new Date();
        video.save(err => {
          if (err) {
            log.error(`${job.data.taskid} error when save downloaded true ${err}`);
            done(err);
          } else {
            log.info(`${job.data.taskid} save downloaded true`);
            queue.create('Jobs', {
              taskid: job.data.taskid,
              type: 4,
              date: job.data.date,
              video: job.data.video,
            }).attempts(3)
              .priority('normal')
              .removeOnComplete(true)
              .save();
            done();
          }
        });
      }
    });
  });
}

function uploadVideo(job, done) {
  Videos.findOne({
    videoid: job.data.video,
  }, (err, video) => {
    if (err) {
      log.error(`${job.data.taskid} Error: ${err}`);
      done(err);
    } else {
      FB.api(`${process.env.facebookPageId}/videos`, 'post', {
        file_url: `https://${process.env.server}/files/${job.data.date}/${video.videoid}.mp4`,
        title : video.title,
        description : `${video.description}\n${video.tags}`,
      }, (res) => {
        if (!res || res.error) {
          log.info(!res ? 'error occurred' : res.error);
          done(err);
        } else {
          log.info(`${job.data.taskid} post id: ${res.id}`);
          video.uploaded = true;
          video.updated_at = new Date();
          video.save(err => {
            if (err) {
              log.error(`${job.data.taskid} error when save uploaded true ${err}`);
              done(err);
            } else {
              log.info(`${job.data.taskid} save uploaded true`);
              createJobCloseTask(job.data.taskid);
              done();
            }
          });
        }
      });
    }
  });
}

function createJobCloseTask(taskid) {
  log.info(`${taskid} Create task to finish task`);
  queue.create('Jobs', {
    taskid,
    type: 10,
  }).attempts(3)
    .priority('normal')
    .removeOnComplete(true)
    .ttl(2000)
    .save();
}

function closeTask(taskid, done) {
  log.info(`${taskid} Finish task`);
  Tasks.findById(taskid, (err, task) => {
    if (err) {
      log.error(`Error: ${err}`);
      done(err);
    } else {
      task.status = 3;
      task.updated_at = new Date();
      task.save(err => {
        if (err) {
          log.error(`${taskid} Error: ${err}`);
          done(err);
        } else {
          log.info(`${taskid} Task success finish`);
          done();
        }
      });
    }
  });
}

queue.process('Jobs', 1, (job, ctx, done) => {
  const domain = require('domain').create();
  domain.on('error', err => {
    done(err);
  });
  domain.run(() => {
    switch (job.data.type) {
      case 1:
        // получаем список видюх
        getHotVideos(job, done);
        break;
      case 2:
        // получаем информацию по конкретному видео
        getVideoInfo(job, done);
        break;
      case 3:
        // скачиваем видео
        downloadVideo(job, done);
        break;
      case 4:
        // загружаем видео
        uploadVideo(job, done);
        break;
      case 10:
        // закрываем задачу
        closeTask(job.data.taskid, done);
        break;
      default:
        done();
    }
  });
});

mongoose.connect(`mongodb://${process.env.mongo}/video`);
