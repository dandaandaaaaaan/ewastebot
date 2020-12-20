require('dotenv').config();
const Telegraf = require('telegraf');

const Extra = require('telegraf/extra');
const Markup = require('telegraf/markup');
const session = require('telegraf/session');
const Stage = require('telegraf/stage');
const Scene = require('telegraf/scenes/base');

const { leave } = Stage;

const request = require('request');

const geoLib = require('geolib');

const { API_TOKEN } = process.env;
const PORT = process.env.PORT || 3000;
const URL = process.env.URL || '';

const bot = new Telegraf(API_TOKEN);

if (process.env.DYNO) {
  // Running on Heroku
  bot.telegram.setWebhook(`${URL}/bot${API_TOKEN}`);
  bot.startWebhook(`/bot${API_TOKEN}`, null, PORT);
} else {
  bot.startPolling();
}

/**
 * @typedef BinLocation
 * @property {number} LATITUDE
 * @property {number} LONGITUDE
 */

/**
 * @typedef BinConstraints
 * @property {number} length
 * @property {number} breadth
 * @property {string} items
 */

/**
 * @typedef EWasteBin
 * @property {string} title
 * @property {string} address
 * @property {BinLocation} location
 * @property {BinConstraints} constraints
 */

const url = 'https://dandaandaaaaaan.github.io/ewastebot/data/data.json';
let data = null;
request({
  url,
  json: true,
}, (error, response, body) => {
  if (!error && response.statusCode === 200) {
    data = body;
  }
});

//Functions
function getOptions(data){
  const names = [];
  for(item of data){
    names.push([item.name]);
    names.sort();
    return names;
  }
}


//Main with /start
bot.start((ctx) => ctx.reply("Hello \nCommands \n-/recycle - search through commonly recycled e-waste to find the nearest e-waste bins to accomodate them\n/search - find the nearest e-waste bin"));

//Recycle Scene
const recycleScene = new Scene('recycle');
//recycleScene.enter(ctx => ctx.reply('What would you like to recycle?')


//Search Scene
const searchScene = new Scene('search');
searchScene.enter(ctx => ctx.reply('Send your location.', Extra.markup(markup => markup.resize()
  .keyboard([
    markup.locationRequestButton('Send location'),
  ]))));

searchScene.on('location', (ctx) => {
  if (data === null) {
    ctx.reply('No data');
    ctx.scene.leave();
    return;
  }
  /** @type {Array<EWasteBin>} */
  const nearestBin = data
    .filter(bin => bin.limit.items == "None")
    .map(bin => Object.assign(bin, {
      distance: geoLib.getDistance(
        ctx.message.location,
        { latitude: bin.location.latitude, longitude: bin.location.longitude },
      ),
    }))
    .sort((a, b) => {
      return a.distance - b.distance;
    });
  if (nearestBin.length === 0) {
    ctx.reply('No data. Enter /search to search for another bin', Extra.markup((m) => m.removeKeyboard()));
    ctx.scene.leave();
    return;
  }
  ctx.reply(`Nearest Bin\n${nearestBin[0].title}\n${nearestBin[0].address}\n${nearestBin[0].distance}m`);
  ctx.replyWithLocation(nearestBin[0].location.latitude, nearestBin[0].location.longitude);
  ctx.reply('Enter /search to search for another bin', Extra.markup((m) => m.removeKeyboard()));
  ctx.scene.leave();
});

// Create scene manager
const stage = new Stage();
stage.command('cancel', leave());
stage.register(searchScene);

// Scene registration
bot.use(session());
bot.use(stage.middleware());
bot.command('search', (ctx) => ctx.scene.enter('search'));
