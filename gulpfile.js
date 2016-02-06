'use strict';
const browserify  = require('browserify');
const gulp        = require('gulp');
const imagemin    = require('gulp-imagemin');
const pngcrush    = require('imagemin-pngcrush');
const babel       = require('gulp-babel');
const uglify      = require('gulp-uglify');
const stylus      = require('gulp-stylus');
const prefix      = require('gulp-autoprefixer');
const cssnano     = require('gulp-cssnano');
const mocha       = require('gulp-mocha');
const plumber     = require('gulp-plumber');
const notify      = require('gulp-notify');
const nib         = require('nib');
const sourcemaps  = require('gulp-sourcemaps');
const source      = require('vinyl-source-stream');
const buffer      = require('vinyl-buffer');
const concat      = require('gulp-concat');
const browserSync = require('browser-sync');
const reload      = browserSync.reload;

gulp.task('images', () => {
  return gulp.src('src/img/**/*')
    .pipe(plumber({
      errorHandler: notify.onError("Error: <%= error.message %>"),
    }))
    .pipe(imagemin({
      progressive: true,
      svgoPlugins: [{
        removeViewBox: false,
      }],
      use: [pngcrush()],
    }))
    .pipe(gulp.dest('public/img'))
    .pipe(reload({
      stream:true,
    }))
    .pipe(notify('Update images'));
});

gulp.task('libs', () => {
  return gulp.src([])
    .pipe(plumber({
      errorHandler: notify.onError("Error: <%= error.message %>"),
    }))
    .pipe(sourcemaps.init())
    .pipe(uglify())
    .pipe(concat('libs.js'))
    .pipe(sourcemaps.write('maps', {
      sourceMappingURLPrefix: '/js/',
    }))
    .pipe(gulp.dest('public/js'))
    .pipe(reload({
      stream: true,
    }))
    .pipe(notify({
      onLast: true,
      message: 'Update libs.js',
    }));
});

gulp.task('compress', () => {
  return browserify('src/js/main.js')
    .bundle()
    .pipe(source('app.js'))
    .pipe(buffer())
    .pipe(plumber({
      errorHandler: notify.onError("Error: <%= error.message %>"),
    }))
    .pipe(sourcemaps.init())
    .pipe(babel())
    .pipe(uglify())
    .pipe(sourcemaps.write('maps', {
      sourceMappingURLPrefix: '/js/',
    }))
    .pipe(gulp.dest('public/js'))
    .pipe(reload({
      stream: true,
    }))
    .pipe(notify({
      onLast: true,
      message: 'Update app.js',
    }));
});

gulp.task('stylus', () => {
  return gulp.src(['src/css/styles.styl'])
    .pipe(plumber({
      errorHandler: notify.onError("Error: <%= error.message %>"),
    }))
    .pipe(sourcemaps.init())
    .pipe(stylus({
      compress: false,
      use: nib(),
    }))
    .pipe(prefix())
    .pipe(cssnano())
    .pipe(concat('styles.css'))
    .pipe(sourcemaps.write('maps'), {
      sourceMappingURLPrefix: '/css/',
    })
    .pipe(gulp.dest('public/css'))
    .pipe(reload({
      stream: true,
    }))
    .pipe(notify({
      onLast: true,
      message: 'Update stylus',
    }));
});

gulp.task('mocha', () => {
  return gulp.src('test/*.js', {
    read: false,
  })
    .pipe(mocha({
      reporter: 'spec',
    }))
    .on('error', (err) => {
      if (!/tests? failed/.test(err.stack)) {
        console.log(err.stack);
      }
    });
});

gulp.task('browser-sync', () => {
  browserSync.init(null, {
    proxy: 'localhost:3000',
    open: false,
    port: 8081,
    notify: false,
  });
});

gulp.task('build', ['libs', 'compress', 'stylus']);

gulp.task('default', ['build', 'images', 'browser-sync'], () => {
  gulp.watch(['views/**/*.jade'], reload);
  gulp.watch(['src/**/*.styl'], ['stylus']);
  gulp.watch(['src/**/*.js'], ['compress']);
  gulp.watch(['src/img/*'], ['images']);
});
