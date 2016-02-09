'use strict';
const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const VideosSchema = new Schema();

VideosSchema.add({
  videoid      : { type: String, index: true }, // идентификатор видео
  title        : String, // назнавание видео
  description  : String, // описание видео
  tags         : Array, // теги видео
  downloaded   : { type: Boolean, index: true }, // скачан с ютюба
  uploaded     : { type: Boolean, index: true }, // закачан на фейсбук
  created_at   : Date,   // дата создания
  updated_at   : Date,    // дата изменения
});

mongoose.model('Videos', VideosSchema);
