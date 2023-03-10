var functions = require('firebase-functions');
var firebase = require('firebase-admin');
var storage = firebase.storage();
const bucket = storage.bucket("farcraft");
var db = firebase.firestore();

const express = require("express");
const api = express();
const cors = require("cors");
const cookieParser = require('cookie-parser')();

const fetch = require('node-fetch');
const _ = require('lodash');
const moment = require('moment');

var imageDataURI = require("image-data-uri");
var textToImage = require("text-to-image");
var text2png = require('text2png');
var sigUtil = require("eth-sig-util");

const { ethers } = require("ethers");
const { nextTick } = require('async');
const gas = require("@enzoferey/network-gas-price");

const { Configuration, OpenAIApi } = require("openai");
const configuration = new Configuration({
  apiKey: process.env.OPENAI_API_KEY,
});
const openai = new OpenAIApi(configuration);

const sleep = (milliseconds) => {
  return new Promise(resolve => setTimeout(resolve, milliseconds))
};

const farJSON = require(__base + 'farcraft/Farcraft.json');

const message = "Sign in to Farcraft";
const mmAPI = "https://api.warpcast.com";
const farcraftFid = 10566;
const launchCastHash = "0xf3296b00645446931f95f364b4312a1479d8ac07";
// Gas
var gasOptions = {"maxPriorityFeePerGas": "151000000000", "maxFeePerGas": "151000000016" };

const categories = {};
// {name: "Avatar", nextMintId: 0, maxMintId: 99999, publicMint: false, mintPrice: 0}
categories[0] = {
  "name": "Avatar",
  "startMintId": 0,
  "maxMintId": 99999,
  "prompt": process.env.FARCRAFT_PROMPT_AVATAR
}
// {name: "Heart", nextMintId: 100000, maxMintId: 199999, publicMint: false, mintPrice: 0}
categories[1] = {
  "name": "Heart",
  "startMintId": 100000,
  "maxMintId": 199999,
  "prompt": process.env.FARCRAFT_PROMPT_HEART
}
categories[2] = {
  "name": "Star",
  "startMintId": 200000,
  "maxMintId": 299999,
  "prompt": process.env.FARCRAFT_PROMPT_STAR
}
categories[3] = {
  "name": "Wand",
  "startMintId": 300000,
  "maxMintId": 399999,
  "prompt": process.env.FARCRAFT_PROMPT_WAND
}

function getConfig(network) {
  if (network == 'testnet') {
    const provider = new ethers.providers.JsonRpcProvider({"url": process.env.API_URL_MUMBAI});
    const far = new ethers.Contract(
      process.env.FARCRAFT_ADDR_TESTNET,
      farJSON.abi,
      provider
    );
    return {
      "far": far,
      "provider": provider,
      "nftAddress": process.env.FARCRAFT_ADDR_TESTNET,
      "size": "512x512",
      "folder": "testnet/",
      "categories": categories
    };
  } else {
    const provider = new ethers.providers.JsonRpcProvider({"url": process.env.API_URL_POLYGON});
    const far = new ethers.Contract(
      process.env.FARCRAFT_ADDR,
      farJSON.abi,
      provider
    );
    return {
      "far": far,
      "provider": provider,
      "nftAddress": process.env.FARCRAFT_ADDR,
      "size": "512x512",
      "folder": "",
      "categories": categories
    };
  }
}

function getCategoryForId(id, config) {
  var category = {};
  for (const c in config.categories) {
    console.log('cat', c);
    console.log('cat[]', JSON.stringify(config.categories[c]));
    const cat = config.categories[c];
    if ( (id >= cat.startMintId) && (id <= cat.maxMintId) ) {
      category = cat;
      break;
    }
  }
  return category;
}

async function generate(id, config, category) {
  return new Promise(async (resolve, reject) => {
    var prompt = category.prompt;
    const aiResponse = await openai.createImage({
      "prompt": prompt,
      "n": 1,
      "size": config.size
    });
    const result = await fetch(aiResponse.data.data[0].url);

    // 2. Save image to storage bucket
    const readStream = result.body;
    const writeStream = bucket.file(`${config.nftAddress}/${id}.png`).createWriteStream();
    readStream.on('error', reject);
    writeStream.on('error', reject);
    writeStream.on('finish', () => resolve(true));
    readStream.pipe(writeStream);
  });
}

async function mint(address, config, categoryId) {
  return new Promise(async (resolve, reject) => {
    var tokenId;
    // mint
    const start = await config.provider.getBlockNumber();
    const signer = new ethers.Wallet(process.env.FARCRAFT_MINTER_PRIV, config.provider);
    
    var pending = true;
    var retries = 0;
    while (pending) {
      try {
        const feeData = await config.provider.getFeeData();
        if (feeData) {
          //gasOptions.maxFeePerGas = feeData.maxFeePerGas;
          //gasOptions.maxPriorityFeePerGas = feeData.maxPriorityFeePerGas;
          console.log("feeData", JSON.stringify(feeData));
        }
        try {
          const networkGasPrice = await gas.getNetworkGasPrice("polygon");
          console.log("networkGasPrice", JSON.stringify(networkGasPrice));
          console.log("maxPriorityFeePerGas", ethers.utils.parseUnits(Math.ceil(networkGasPrice.high.maxPriorityFeePerGas).toString(), "gwei"));
          console.log("maxFeePerGas", ethers.utils.parseUnits(Math.ceil(networkGasPrice.high.maxFeePerGas).toString(), "gwei"));
        } catch (e) {
          console.log(e);
        }
        console.log('ready to mint', address, categoryId, gasOptions);
        await (await config.far.connect(signer).mint(address, categoryId, gasOptions)).wait();
        pending = false;
      } catch (e) {
        const errorCode = e.code;
        console.log(errorCode);
        if (errorCode && (errorCode == "REPLACEMENT_UNDERPRICED" || errorCode == "NONCE_EXPIRED")) {
          pending = true;
          retries++;
          console.log("NONCE issue. Retry count " + retries);
          const delay = _.random(1000, 5000);
          await sleep(delay);
        }
      }
    }
    
    let minted = config.far.filters.Transfer(null, address);
    let mintedLogs = await config.far.queryFilter(minted, start, "latest");
    console.log(JSON.stringify(mintedLogs));
    for (let m = 0; m < mintedLogs.length; m++) {
      console.log("minted", JSON.stringify(mintedLogs[m]));
      tokenId = mintedLogs[m].args[2];
      console.log("tokenId from logs is " + parseInt(tokenId));
    }
    resolve(tokenId);
  });
}  


module.exports.cron = async function(context) {
  console.log('This will be run every 5 minutes!');

  // 1. get recasters on a specific cast, create users for each:
  const castHash = launchCastHash;
  const headers = {
    'Authorization': 'Bearer ' + process.env.FARCRAFT_MM_BEARER, 
    'Content-Type': 'application/json'
  };
  var res = await fetch(mmAPI + '/v2/cast-recasters?limit=100&castHash=' + castHash, { 
    method: 'GET', 
    headers: headers
  });
  var usersResult = await res.json();
  console.log(JSON.stringify(usersResult));
  // 1.5. get followers of Farcraft account
  const followRes = await fetch(mmAPI + '/v2/followers?fid=' + farcraftFid, { 
    method: 'GET', 
    headers: headers
  });
  var followersResult = await followRes.json();
  // merge results:
  const users = usersResult.result.users.concat(followersResult.result.users);
  user:
  for (let i = 0; i < users.length; i++) {
    var user = users[i];
    const userRef = db.collection('farcraft').doc(`1`).collection('users').doc(user.fid.toString());
    var doc = await userRef.get();
    if (doc.exists) {
      console.log("user doc exists " + JSON.stringify(user));
    } else {
      // get eth address
      const res = await fetch(mmAPI + '/v2/verifications?fid=' + user.fid, { 
        method: 'GET', 
        headers: {
            'Authorization': 'Bearer ' + process.env.FARCRAFT_MM_BEARER, 
            'Content-Type': 'application/json'
        }
      });
      var verificationResult = await res.json();
      console.log("verifications", JSON.stringify(verificationResult));
      var address = null;
      for (let j = 0; j < verificationResult.result.verifications.length; j++) {
        if ("address" in verificationResult.result.verifications[j]) {
          if ("fid" in verificationResult.result.verifications[j]) {
            if (user.fid == verificationResult.result.verifications[j].fid) {
              address = verificationResult.result.verifications[j].address;
            } else {
              console.log("verification fid does not match user fid", user.fid);
            }
          }
        }
      }
      if (address) {
        user.address = address;
      } else {
        console.log("no address, now what? " + JSON.stringify(user));
        continue user;
      }
      await userRef.set(user);
    }
  }

  // 2. Get Likes for the same cast
  res = await fetch(mmAPI + '/v2/cast-likes?limit=100&castHash=' + castHash, { 
    method: 'GET', 
    headers: {
        'Authorization': 'Bearer ' + process.env.FARCRAFT_MM_BEARER, 
        'Content-Type': 'application/json'
    }
  });
  var likeResult = await res.json();
  console.log(JSON.stringify(likeResult));
  like:
  for (let j = 0; j < likeResult.result.likes.length; j++) {
    const like = likeResult.result.likes[j];
    const userRef = db.collection('farcraft').doc(`1`).collection('users').doc(like.reactor.fid.toString());
    var doc = await userRef.get();
    if (doc.exists) {
      console.log("reactor user doc exists " + JSON.stringify(like.reactor));
      // mint a Heart
      await userRef.set({ "OG": true}, {"merge": true});
    } else {
      // no op, or create user?
    } 
  }

  return null;
}

module.exports.newUser = async function(snap, context) {
  const user = snap.data();
  const address = user.address;
  if (!address) {
    return;
  }
  const userRef = snap.ref;
  // Now mint Avatar
  const config = getConfig();
  //const contractCategory = getCategoryForId(parseInt(tokenId), config);
  const contractCategory = config.categories[0]; // 0 for Avatar
  
  const tokenId = await mint(address, config, 0);

  if (tokenId) {
    user.tokenId = tokenId;
    await userRef.set({ "tokenId": parseInt(tokenId)}, {"merge": true});

    const tokenRef = db.collection('farcraft').doc(`1`).collection('tokens').doc(tokenId.toString());
    await tokenRef.set({
      "id": parseInt(tokenId),
      "type": contractCategory.name,
      "owner": user.address
    });

    const body = {
      "targetFid": user.fid,
    };
    var res = await fetch(mmAPI + '/v2/follows', { 
      method: 'PUT', 
      headers: {
          'Authorization': 'Bearer ' + process.env.FARCRAFT_MM_BEARER, 
          'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    });
    var followResult = await res.json();
    console.log(JSON.stringify(followResult));
  }
}

module.exports.updateUser = async function(change, context) {
  const userBefore = change.before.data();
  const userAfter = change.after.data();
  const config = getConfig();
  if ( (userBefore.OG != true) && (userAfter.OG == true) ) {
    const address = userAfter.address;
    if (address) {
      await sleep(3000);
      const tokenId = await mint(address, config, 1); // 1 for Heart
      if (tokenId) {
        const contractCategory = getCategoryForId(parseInt(tokenId), config);
        const tokenRef = db.collection('farcraft').doc(`1`).collection('tokens').doc(tokenId.toString());
        await tokenRef.set({
          "id": parseInt(tokenId),
          "type": contractCategory.name,
          "owner": address
        });
      }
    }
  }
}

module.exports.newToken = async function(snap, context) {
  // generate image
  const config = getConfig();
  const tokenId = context.params.tokenId;
  const contractCategory = getCategoryForId(parseInt(tokenId), config);
  if (!contractCategory) {
    return console.log(`cannot find token Category for ${tokenId}`);
  }
  await generate(tokenId, config, contractCategory);

  // Post a cast with
  const image = `https://api.farcraft.xyz/${config.folder}images/${tokenId}.png`;
  await fetch(image); // get image into CDN before casting
  var text = "";
  // 1. Get user:
  const token = snap.data();
  const userRef = db.collection('farcraft').doc(`1`).collection('users');
  const query = userRef.where("address", "==", token.owner);
  const querySnapshot =  await query.get();
  var user;
  querySnapshot.forEach((doc) => {
    const u = doc.data();
    if (!user) {
      user = u;
    }
  });
  if (user) {
    var username = user.username;
    if (token.type == "Avatar") {
      text = `\@${username} thank you for joining Farcraft ${image}`;
    } else {
      text = `\@${username} is now a Farcraft OG and has earned a ${token.type} ${image}`;
    }
  }
  if (text) {
    //const body = {
      //"text": text,
      //"parent": {
      //    "fid": 8685,
      //    "hash": launchCastHash
      //}
    //};
    const body = {
      "text": text
    };
    var res = await fetch(mmAPI + '/v2/casts', { 
      method: 'POST', 
      headers: {
          'Authorization': 'Bearer ' + process.env.FARCRAFT_MM_BEARER, 
          'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    });
    var castResult = await res.json();
    console.log(JSON.stringify(castResult));
  }
}



function getSig(req, res, next) {
  console.log(req.cookies["__session"]);
  var sig = null;
  if ("cookies" in req) {
    if ("__session" in req.cookies) {
      sig = req.cookies["__session"];
    }
  }
  req.sig = sig;
  next();
}

api.use(cors({ origin: true })); // enable origin cors
api.use(cookieParser);
api.use(getSig);

api.get(['/images/:id.png', '/:network/images/:id.png'], async function (req, res) {
  //console.log("network", req.params.network);
  console.log("start /images/ with path", req.path);
  const id = parseInt(req.params.id);
  const network = req.params.network;
  const config = getConfig(network);
  //console.log("image id", id);
  var cache = 'public, max-age=3600, s-maxage=86400';

  // Step 1: Fetch Image
  //console.log("path", req.path);
  var file;

  try {
    file = await bucket.file(`${config.nftAddress}/${id}.png`).download();
    //console.log(file);
  }
  catch (e) {
    console.log(`image: did not find image for ${req.path} for id ${id}`);
    //return res.json({"result": "catch: no file yet"});
  }

  if (!file) {
    return res.json({"result": "no file yet"});
  }

  const img = file[0];
  res.set('Cache-Control', cache);
  res.writeHead(200, {
    'Content-Type': 'image/png',
    'Content-Length': img.length
  });
  return res.end(img);
}); // image

api.get(['/meta/:id', '/:network/meta/:id'], async function (req, res) {
  console.log("start /meta/ with path", req.path);
  const network = req.params.network;
  const config = getConfig(network);
  const nftAddress = config.nftAddress;
  const id = parseInt(req.params.id);
  const folder = config.folder;
  //console.log("id", id);
  var cache = 'public, max-age=60, s-maxage=120';

  // Step 1: Get Token
  console.log(req.path);

  const category = getCategoryForId(parseInt(id), config);

  var meta = {
    "name": `Farcraft ${category.name} #${id}`,
    "description": "Farcraft is for Farcasters",
    "external_url": "https://farcraft.xyz", 
    "image": `https://api.farcraft.xyz/${folder}images/${id}.png`,
    "seller_fee_basis_points": 500,
    "fee_recipient": process.env.FARCRAFT_MINTER,
    "token_id": id,
    "attributes": [
        {
            "trait_type": "Type", 
            "value": category.name,
        }, 
        {
            "trait_type": "ID", 
            "value": id.toString(),
        }
    ] 
  };
  
  
  const userRef = db.collection('farcraft').doc(`1`).collection('users');
  const query = userRef.where("tokenId", "==", parseInt(id));
  const querySnapshot =  await query.get();
  querySnapshot.forEach((doc) => {
    const user = doc.data();
    if (user) {
      meta.attributes.push({
          "trait_type": "fid", 
          "value": user.fid.toString()
      });
      meta.attributes.push({
        "trait_type": "Username", 
        "value": user.username
      });
      if ("OG" in user) {
        if (user.OG == true) {
          meta.attributes.push({
            "trait_type": "OG", 
            "value": true
          });
        }
      }
      // demo attributes -- lots of interesting things that can be done
      meta.attributes.push(
        {
          "trait_type": "SPELLs", 
          "value": 1000
        },
        {
          "trait_type": "Level", 
          "value": 10,
          "max_value": 42
        },
        {
          "trait_type": "Daily Streak", 
          "value": 8
        },
        {
          "trait_type": "Week Rank", 
          "value": 4
        },
        {
          "trait_type": "Day Rank", 
          "value": 12
        },
        {
          "trait_type": "Month Rank", 
          "value": 69
        },
        {
          "display_type": "boost_number", 
          "trait_type": "Other Tokens", 
          "value": 2
        }
      );
    }
  });

  res.set('Cache-Control', cache);
  return res.json(meta);
}); // meta

module.exports.api = api;