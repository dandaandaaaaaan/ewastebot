/* eslint-disable linebreak-style */
require('dotenv').config();
const ua = require('universal-analytics');
const Telegraf = require('telegraf');
const Extra = require('telegraf/extra');
const session = require('telegraf/session');
const Stage = require('telegraf/stage');
const Scene = require('telegraf/scenes/base');

const { leave } = Stage;

const request = require('request');

const geoLib = require('geolib');

const { API_TOKEN, GOOGLE_ANALYTICS } = process.env;
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
const faqUrl = 'https://dandaandaaaaaan.github.io/ewastebot/data/faq.json';
let data = null;
let itemData = null;
let programmesData = null;
let faqData = null;
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
request({
  url: faqUrl,
  json: true,
}, (error, response, body) => {
  if (!error && response.statusCode === 200) {
    faqData = body;
  }
})

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

let visitor = null;
// Main with /start
bot.start((ctx) => {
  ctx.replyWithMarkdown(`Hello, I am the Singapore e-waste bot!

*Commands*
- /recycle - Search through commonly recycled e-waste to find the nearest e-waste bins to accommodate them

- /search - Find the nearest e-waste bin from you

- /programmes - Details on various e-waste collection programmes in Singapore

- /faq - Frequently Asked Questions on e-waste recycling and this bot`);
  visitor = ua(GOOGLE_ANALYTICS, `${ctx.chat.id}`, { strictCidFormat: false, cookie_domain: 'auto' });
  visitor.event('start','botstart',`${ctx.chat.id}`).send();
});

// Recycle Scene
const recycleScene = new Scene('recycle');

recycleScene.enter((ctx) => { ctx.reply('What would you like to recycle?', Extra.markup(markup => markup
  .keyboard(
    getOptions(itemData),
  ).oneTime()));
if (visitor == null) {
  visitor = ua(GOOGLE_ANALYTICS, `${ctx.chat.id}`, { strictCidFormat: false, cookie_domain: 'auto' });
}
visitor.event('action', 'recycle', `${ctx.chat.id}`).send();
});

recycleScene.on('message', (ctx) => {
  const selectedItem = itemData
    .filter(item => item.name === ctx.update.message.text);
  if (data === null) {
    ctx.reply('No data, check server');
    ctx.scene.leave();
  }
  if (selectedItem.length === 0) {
    ctx.reply('Invalid selection! Use /recycle to search again', Extra.markup(m => m.removeKeyboard()));
    ctx.scene.leave();
  } else {
    ctx.session.selectedItem = selectedItem;
    if (selectedItem[0].name === 'Alkaline Battery') {
      ctx.reply('Alkaline batteries in Singapore meet limits of mercury content, and thus they can be disposed together with general waste!', Extra.markup(m => m.removeKeyboard()));
      ctx.scene.leave();
    }
    // eslint-disable-next-line radix
    else if (parseInt(selectedItem[0].dimensions.length) >= 600 || parseInt(selectedItem[0].dimensions.width) >= 300) {
      ctx.replyWithMarkdown(`Your item will likely be unable to fit in any of the public e-waste bins! Do consider the following options to dispose them

*Living in a HDB*
Please contact your town council for details on free removal service

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

searchWithConstraintsScene.enter(ctx => ctx.reply('Send your location or enter your postal code.', Extra.markup(markup => markup.resize()
  .keyboard([
    markup.locationRequestButton('Send location'),
  ]))));

function searchWithConstraintsFunc(ctx, selectedItem, location) {
  if (selectedItem.dimensions.width !== '0' && selectedItem.dimensions.length !== '0') {
    const nearestLocation = data
      .filter(bin => bin.limit.items === 'None')
      // eslint-disable-next-line radix
      .filter(bin => parseInt(bin.limit.length) >= parseInt(selectedItem.dimensions.length))
      // eslint-disable-next-line radix
      .filter(bin => parseInt(bin.limit.width) >= parseInt(selectedItem.dimensions.width))
      .map(bin => Object.assign(bin, {
        distance: geoLib.getDistance(
          location,
          { latitude: bin.location.latitude, longitude: bin.location.longitude },
        ),
      }))
      .sort((a, b) => a.distance - b.distance);
    visitor.event('map', 'location', `${location.latitude},${location.longitude}`).send();
    if (nearestLocation.length > 0) {
      ctx.webhookReply = false;
      ctx.replyWithMarkdown(`*Nearest Bin*
${nearestLocation[0].title}
${nearestLocation[0].address}
${nearestLocation[0].distance}m away

Size Limit: ${nearestLocation[0].limit.length}mm x ${nearestLocation[0].limit.width}mm
This is just an estimate! 
Do ensure your recyclables can fit within the size limit shown `, Extra.markup(m => m.removeKeyboard()));
      ctx.replyWithLocation(nearestLocation[0].location.latitude,
        nearestLocation[0].location.longitude);
      ctx.webhookReply = true;
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
          location,
          { latitude: bin.location.latitude, longitude: bin.location.longitude },
        ),
      }))
      .sort((a, b) => a.distance - b.distance);
    visitor.event('map', 'location', `${location.latitude},${location.longitude}`).send();
    ctx.webhookReply = false;
    ctx.replyWithMarkdown(`
*Nearest Bin*
${nearestLocation[0].title}
${nearestLocation[0].address}
${nearestLocation[0].distance}m away

Item Limits: Printer Ink/Toner cartridges`, Extra.markup(m => m.removeKeyboard()));
    ctx.replyWithLocation(nearestLocation[0].location.latitude,
      nearestLocation[0].location.longitude);
    ctx.webhookReply = true;
    ctx.scene.leave();
  }
}

searchWithConstraintsScene.on('text', (ctx) => {
  const selectedItem = ctx.session.selectedItem[0];
  if (ctx.message.text.length === 6 && !isNaN(ctx.message.text)) {
    const apiCall = `https://developers.onemap.sg/commonapi/search?searchVal=${ctx.message.text}&returnGeom=Y&getAddrDetails=Y`
    let returnLocation = null;
    request({
      url: apiCall,
      json: true,
    }, (error, response, body) => {
      if (!error && response.statusCode === 200 && body.results.length > 0) {
        returnLocation = body;
        searchWithConstraintsFunc(ctx, selectedItem, { latitude: returnLocation.results[0].LATITUDE, longitude: returnLocation.results[0].LONGITUDE });
      } else {
        ctx.replyWithMarkdown(`Invalid postal code!
Re-enter postal code, send location, or type "cancel" to exit`), Extra.markup(markup => markup.resize()
          .keyboard([
            markup.locationRequestButton('Send location'),
          ]));
      }
    })
  } else if (ctx.message.text.toLowerCase() === 'cancel') {
    ctx.replyWithMarkdown('Search Cancelled', Extra.markup(m => m.removeKeyboard()));
    ctx.scene.leave();
  } else {
    ctx.replyWithMarkdown(`Invalid postal code!
Re-enter postal code, send location, or type "cancel" to exit`), Extra.markup(markup => markup.resize()
      .keyboard([
        markup.locationRequestButton('Send location'),
      ]));
  }
});

searchWithConstraintsScene.on('location', (ctx) => {
  const selectedItem = ctx.session.selectedItem[0];
  searchWithConstraintsFunc(ctx, selectedItem, ctx.message.location);
});

// Search Scene
const searchScene = new Scene('search');
searchScene.enter((ctx) => {
  ctx.reply('Send your location or enter your postal code.', Extra.markup(markup => markup.resize()
    .keyboard([
      markup.locationRequestButton('Send location'),
    ])));
  if (visitor == null) {
    visitor = ua(GOOGLE_ANALYTICS, `${ctx.chat.id}`, { strictCidFormat: false, cookie_domain: 'auto' });
  }
  visitor.event('action', 'search', `${ctx.chat.id}`).send();
});

function searchSceneFunc(ctx, location) {
  const nearestBin = data
    .filter(bin => bin.limit.items === 'None')
    .map(bin => Object.assign(bin, {
      distance: geoLib.getDistance(
        location,
        { latitude: bin.location.latitude, longitude: bin.location.longitude },
      ),
    }))
    .sort((a, b) => a.distance - b.distance);
  visitor.event('map', 'location', `${location.latitude},${location.longitude}`).send();
  if (nearestBin.length === 0) {
    ctx.reply('No data. Enter /search to search for another bin', Extra.markup(m => m.removeKeyboard()));
    ctx.scene.leave();
  }
  ctx.webhookReply = false;
  ctx.replyWithMarkdown(`*Nearest Bin*
${nearestBin[0].title}
${nearestBin[0].address}
${nearestBin[0].distance}m away

Size Limit: ${nearestBin[0].limit.length}mm x ${nearestBin[0].limit.width}mm`, Extra.markup(m => m.removeKeyboard()));
  ctx.replyWithLocation(nearestBin[0].location.latitude, nearestBin[0].location.longitude);
  ctx.webhookReply = true;
  ctx.scene.leave();
}

searchScene.on('text', (ctx) => {
  if (ctx.message.text.length === 6 && !isNaN(ctx.message.text)) {
    const apiCall = `https://developers.onemap.sg/commonapi/search?searchVal=${ctx.message.text}&returnGeom=Y&getAddrDetails=Y`
    let returnLocation = null;
    request({
      url: apiCall,
      json: true,
    }, (error, response, body) => {
      ctx.webhookReply = false;
      if (body.results.length === 0) {
        ctx.replyWithMarkdown(`Invalid postal code!
Re-enter postal code, send your location, or type "cancel" to exit`), Extra.markup(markup => markup.resize()
                  .keyboard([
                    markup.locationRequestButton('Send location'),
                  ]));
        ctx.webhookReply = true;
      }
      if (!error && response.statusCode === 200 && body.results.length > 0) {
        returnLocation = body;
        ctx.webhookReply = true;
        searchSceneFunc(ctx, { latitude: returnLocation.results[0].LATITUDE, longitude: returnLocation.results[0].LONGITUDE });
      }
    })
  } else if (ctx.message.text.toLowerCase() === 'cancel') {
    ctx.replyWithMarkdown('Search Cancelled', Extra.markup(m => m.removeKeyboard()));
    ctx.scene.leave();
  } else {
    ctx.replyWithMarkdown(`Invalid postal code!
Re-enter postal code, send location, or type "cancel" to exit`), Extra.markup(markup => markup.resize()
      .keyboard([
        markup.locationRequestButton('Send location'),
      ]));
  }
})

searchScene.on('location', (ctx) => {
  if (data === null) {
    ctx.reply('No data, check server');
    ctx.scene.leave();
  }
  /** @type {Array<EWasteBin>} */
  searchSceneFunc(ctx, ctx.message.location)
});

// Programmes Scene
const programmesScene = new Scene('programmes');

programmesScene.enter((ctx) => {
  ctx.reply('Choose the programme to learn more about.', Extra.markup(markup => markup
    .keyboard(
      getOptions(programmesData),
    ).oneTime()));
  if (visitor == null) {
    visitor = ua(GOOGLE_ANALYTICS, `${ctx.chat.id}`, { strictCidFormat: false, cookie_domain: 'auto' });
  }
  visitor.event('action', 'programmes', `${ctx.chat.id}`).send();
});
programmesScene.on('text', (ctx) => {
  const selectedProgramme = programmesData
    .filter(programme => programme.name === ctx.update.message.text);
  if (selectedProgramme.length === 0) {
    ctx.reply('Invalid selection! Use /programmes to search through programmes again', Extra.markup(m => m.removeKeyboard()));
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
    ctx.replyWithPhoto({ source: `./assets/${selectedProgramme[0].photo}` }, Extra.markup(m => m.removeKeyboard()));
  }
  ctx.scene.leave();
});

// FAQ Scene

const faqScene = new Scene('faq');

faqScene.enter((ctx) => {
  ctx.reply('Select your question', Extra.markup(markup => markup
    .keyboard(
      getOptions(faqData),
    )));
  if (visitor == null) {
    visitor = ua(GOOGLE_ANALYTICS, `${ctx.chat.id}`, { strictCidFormat: false, cookie_domain: 'auto' });
  }
  visitor.event('action', 'faq', `${ctx.chat.id}`).send();
});


faqScene.on('text', (ctx) => {
  const selectedQn = faqData
    .filter(qn => qn.name === ctx.update.message.text);
  if (selectedQn.length === 0) {
    ctx.reply('Invalid selection! Use /faq to search through frequently asked questions again', Extra.markup(m => m.removeKeyboard()));
  } else {
    ctx.replyWithMarkdown(`${selectedQn[0].reply}`, Extra.markup(m => m.removeKeyboard()));
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
stage.register(faqScene);

// Scene registration
bot.use(session());
bot.use(stage.middleware());
bot.command('search', ctx => ctx.scene.enter('search'));
bot.command('recycle', ctx => ctx.scene.enter('recycle'));
bot.command('programmes', ctx => ctx.scene.enter('programmes'));
bot.command('faq', ctx => ctx.scene.enter('faq'));
