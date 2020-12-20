/* eslint-disable linebreak-style */
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
const URL = process.env.URL || 'https://ewaste-bot.herokuapp.com';

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
const recycleablesUrl = 'https://dandaandaaaaaan.github.io/ewastebot/data/recycleables.json';
let data = null;
let itemData = null;
request({
  url,
  json: true,
}, (error, response, body) => {
  if (!error && response.statusCode === 200) {
    data = body;
  }
});
request({
  url: recycleablesUrl,
  json: true,
}, (error, response, body) => {
  if (!error && response.statusCode === 200) {
    itemData = body;
  }
});

// Functions
function getOptions(content) {
  const names = [];
  let item = null;
  // eslint-disable-next-line no-restricted-syntax
  for (item of content) {
    names.push([item.name]);
  }
  names.sort();
  return names;
}


// Main with /start
bot.start(ctx => ctx.reply('Hello \nCommands\n- /recycle - search through commonly recycled e-waste to find the nearest e-waste bins to accomodate them\n- /search - find the nearest e-waste bin'));

// Recycle Scene
const recycleScene = new Scene('recycle');

recycleScene.enter(ctx => ctx.reply('What would you like to recycle?', Extra.markup(markup => markup
  .keyboard(
    getOptions(itemData),
  ))));

recycleScene.on('message', (ctx) => {
  const selectedItem = itemData
    .filter(item => item.name === ctx.update.message.text);
  if (data === null) {
    ctx.reply('No data, check server');
    ctx.scene.leave();
    return;
  }
  ctx.session.selectedItem = selectedItem;
  // eslint-disable-next-line radix
  if (parseInt(selectedItem[0].dimensions.length) >= 600 || parseInt(selectedItem[0].dimensions.width) >= 300) {
    ctx.replyWithMarkdown(`Your item will likely be unable to fit in any of the public e-waste bins! Do consider the following options to dispose them

*Living in a HDB*
Please contact your town council for details on free reomval service

*Living in a Condominium*
Please contact your condominium management on details for removal services


Alternatively, the following is a list of the Public Waste Collectors with their contacts and areas they serve

800 Super Waste Management Pte Ltd
- Ang Mo Kio-Toa Payoh and Pasir Ris-Bedok sectors: 6366 3800

ALBA W&H Smart City Pte Ltd
- Jurong sector: 8008-5268-60 (toll-free)

SembWaste Pte Ltd
- City-Punggol and Woodlands-Yishun sectors: 1800-278-6135

Veolia ES Singapore Pte Ltd
- Clementi-Bukit Merah sector: 6865 3140
    `, Extra.markup(m => m.removeKeyboard()));
    ctx.scene.leave();
  } else if (ctx.session.selectedItem !== null) {
    ctx.scene.leave();
    ctx.scene.enter('searchWithConstraints');
  }
});

// Search for bin with constraints scene
const searchWithConstraintsScene = new Scene('searchWithConstraints');

searchWithConstraintsScene.enter(ctx => ctx.reply('Send your location.', Extra.markup(markup => markup.resize()
  .keyboard([
    markup.locationRequestButton('Send location'),
  ]))));
searchWithConstraintsScene.on('location', (ctx) => {
  const selectedItem = ctx.session.selectedItem[0];
  if (selectedItem.dimensions.width !== 0 && selectedItem.dimensions.length !== 0) {
    const nearestLocation = data
      .filter(bin => bin.limit.items === 'None')
      // eslint-disable-next-line radix
      .filter(bin => parseInt(bin.limit.length) >= parseInt(selectedItem.dimensions.length))
      // eslint-disable-next-line radix
      .filter(bin => parseInt(bin.limit.width) >= parseInt(selectedItem.dimensions.width))
      .map(bin => Object.assign(bin, {
        distance: geoLib.getDistance(
          ctx.message.location,
          { latitude: bin.location.latitude, longitude: bin.location.longitude },
        ),
      }))
      .sort((a, b) => a.distance - b.distance);
    if (nearestLocation.length > 0) {
      ctx.reply(`Nearest Bin\n${nearestLocation[0].title}\n${nearestLocation[0].address}\n${nearestLocation[0].distance}m away\n
Size Limit: ${nearestLocation[0].limit.length}mm x ${nearestLocation[0].limit.width}mm\nThis is just an estimate! 
Do ensure your recyclables can fit within the size limit shown `, Extra.markup(m => m.removeKeyboard()));
      ctx.replyWithLocation(nearestLocation[0].location.latitude,
        nearestLocation[0].location.longitude);
      ctx.scene.leave();
    } else {
      ctx.reply('No bin found that can accomodate items');
      ctx.scene.leave();
    }
  }
  if (selectedItem.dimensions.width === 0 && selectedItem.dimensions.length === 0) {
    const nearestLocation = data
      .filter(bin => bin.limit.items === 'Ink')
      .map(bin => Object.assign(bin, {
        distance: geoLib.getDistance(
          ctx.message.location,
          { latitude: bin.location.latitude, longitude: bin.location.longitude },
        ),
      }))
      .sort((a, b) => a.distance - b.distance);
    ctx.reply(`Nearest Bin\n${nearestLocation[0].title}\n${nearestLocation[0].address}\n${nearestLocation[0].distance} away\n
Size Limit: ${nearestLocation[0].limit.length}mm x ${nearestLocation[0].limit.width}mm`, Extra.markup(m => m.removeKeyboard()));
    ctx.replyWithLocation(nearestLocation[0].location.latitude,
      nearestLocation[0].location.longitude);
  }
});

// Search Scene
const searchScene = new Scene('search');
searchScene.enter(ctx => ctx.reply('Send your location.', Extra.markup(markup => markup.resize()
  .keyboard([
    markup.locationRequestButton('Send location'),
  ]))));

searchScene.on('location', (ctx) => {
  if (data === null) {
    ctx.reply('No data, check server');
    ctx.scene.leave();
    return;
  }
  /** @type {Array<EWasteBin>} */
  const nearestBin = data
    .filter(bin => bin.limit.items === 'None')
    .map(bin => Object.assign(bin, {
      distance: geoLib.getDistance(
        ctx.message.location,
        { latitude: bin.location.latitude, longitude: bin.location.longitude },
      ),
    }))
    .sort((a, b) => a.distance - b.distance);
  if (nearestBin.length === 0) {
    ctx.reply('No data. Enter /search to search for another bin', Extra.markup(m => m.removeKeyboard()));
    ctx.scene.leave();
    return;
  }
  ctx.reply(`Nearest Bin\n${nearestBin[0].title}\n${nearestBin[0].address}\n${nearestBin[0].distance}m`);
  ctx.replyWithLocation(nearestBin[0].location.latitude, nearestBin[0].location.longitude);
  ctx.reply('Enter /search to search for another bin', Extra.markup(m => m.removeKeyboard()));
  ctx.scene.leave();
});

// Create scene manager
const stage = new Stage();
stage.command('cancel', leave());
stage.register(searchScene);
stage.register(recycleScene);
stage.register(searchWithConstraintsScene);

// Scene registration
bot.use(session());
bot.use(stage.middleware());
bot.command('search', ctx => ctx.scene.enter('search'));
bot.command('recycle', ctx => ctx.scene.enter('recycle'));
