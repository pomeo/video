'use strict';
const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const TasksSchema = new Schema();

TasksSchema.add({
  type         : { type: Number, index: true }, // тип задания
  status       : { type: Number, index: true }, // статус задания
  video        : { type: String, index: true }, // идентификатор видео
  country      : String, // буквенный идентификатор страны
  category     : String, // буквенный идентификатор категории
  date         : { type: Number, index: true }, // дата в запросе
  count        : { type: Number, index: true, default: 0 }, // количество попыток запуска
  created_at   : Date,   // дата создания
  updated_at   : Date,    // дата изменения
});

mongoose.model('Tasks', TasksSchema);
