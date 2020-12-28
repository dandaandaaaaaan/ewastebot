/* eslint-disable linebreak-style */
require('dotenv').config();
const Telegraf = require('telegraf');
const Extra = require('telegraf/extra');
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
const programmesUrl = 'https://dandaandaaaaaan.github.io/ewastebot/data/programmes.json'
let data = null;
let itemData = null;
let programmesData = null;
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
request({
  url: programmesUrl,
  json: true,
}, (error, response, body) => {
  if (!error && response.statusCode === 200) {
    programmesData = body;
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
bot.start(ctx => ctx.replyWithMarkdown(`Hello, I am the e-waste bot!

*Commands*
- /recycle - Search through commonly recycled e-waste to find the nearest e-waste bins to accommodate them
- /search - Find the nearest e-waste bin from you
- /programmes - Details on various e-waste collection programmes in Singapore`));

// Recycle Scene
const recycleScene = new Scene('recycle');

recycleScene.enter(ctx => ctx.reply('What would you like to recycle?', Extra.markup(markup => markup
  .keyboard(
    getOptions(itemData),
  ).oneTime())));

recycleScene.on('message', (ctx) => {
  const selectedItem = itemData
    .filter(item => item.name === ctx.update.message.text);
  if (data === null) {
    ctx.reply('No data, check server');
    ctx.scene.leave();
    return;
  }
  if (selectedItem.length === 0) {
    ctx.reply('Invalid selection! Use /recycle to search again', Extra.markup(m => m.removeKeyboard()));
    ctx.scene.leave();
  } else {
    ctx.session.selectedItem = selectedItem;
    if (selectedItem[0].name == "Alkaline Battery") {
      ctx.reply(`Alkaline batteries in Singapore meet limits of mercury content, and thus they can be disposed together with general waste!`, Extra.markup(m => m.removeKeyboard()));
      ctx.scene.leave();
    }
    // eslint-disable-next-line radix
    else if (parseInt(selectedItem[0].dimensions.length) >= 600 || parseInt(selectedItem[0].dimensions.width) >= 300) {
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
  if (selectedItem.dimensions.width !== '0' && selectedItem.dimensions.length !== '0') {
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
  if (selectedItem.dimensions.width === '0' && selectedItem.dimensions.length === '0' && selectedItem.name == 'Ink/Toner Cartridges') {
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
Item Limits: Printer Ink/Toner cartridges`, Extra.markup(m => m.removeKeyboard()));
    ctx.replyWithLocation(nearestLocation[0].location.latitude,
      nearestLocation[0].location.longitude);
    ctx.scene.leave();
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
  ctx.reply(`Nearest Bin\n${nearestBin[0].title}\n${nearestBin[0].address}\n${nearestBin[0].distance}m`, Extra.markup(m => m.removeKeyboard()));
  ctx.replyWithLocation(nearestBin[0].location.latitude, nearestBin[0].location.longitude);
  ctx.scene.leave();
});

// Programmes Scene
const programmesScene = new Scene('programmes');

programmesScene.enter(ctx => ctx.reply('Choose the programme to learn more about.', Extra.markup(markup => markup
  .keyboard(
    getOptions(programmesData),
  ).oneTime())));
programmesScene.on('message', (ctx) => {
  const selectedProgramme = programmesData
    .filter(programme => programme.name === ctx.update.message.text);
  if (selectedProgramme.length === 0) {
    ctx.reply('Invalid selection! Use /programmes to search again', Extra.markup(m => m.removeKeyboard()));
    ctx.scene.leave();
  } else {
    const returnString = `*${selectedProgramme[0].name}*

${selectedProgramme[0].description}
`;
    if (selectedProgramme[0].limits.items != null) {
      ctx.replyWithMarkdown(`${returnString}
Item Limits: ${selectedProgramme[0].limits.items}
      `, Extra.markup(m => m.inlineKeyboard([m.urlButton('More Details', selectedProgramme[0].website)])));
    } else if (selectedProgramme[0].limits.height == null) {
      ctx.replyWithMarkdown(`${returnString}
Size Limits: ${selectedProgramme[0].limits.length}mm x ${selectedProgramme[0].limits.width}mm`, Extra.markup(m => m.inlineKeyboard([m.urlButton('More Details', selectedProgramme[0].website)])));
    } else {
      ctx.replyWithMarkdown(`${returnString}
Size Limits: ${selectedProgramme[0].limits.length}mm x ${selectedProgramme[0].limits.width}mm x ${selectedProgramme[0].limits.height}mm`, Extra.markup(m => m.inlineKeyboard([m.urlButton('More Details', selectedProgramme[0].website)])));
    }
    ctx.replyWithPhoto({source: `./assets/${selectedProgramme[0].photo}`}, Extra.markup(m => m.removeKeyboard()));
  }
  ctx.scene.leave();
});

// Create scene manager
const stage = new Stage();
stage.command('cancel', leave());
stage.register(searchScene);
stage.register(recycleScene);
stage.register(searchWithConstraintsScene);
stage.register(programmesScene);

// Scene registration
bot.use(session());
bot.use(stage.middleware());
bot.command('search', ctx => ctx.scene.enter('search'));
bot.command('recycle', ctx => ctx.scene.enter('recycle'));
bot.command('programmes', ctx => ctx.scene.enter('programmes'));
