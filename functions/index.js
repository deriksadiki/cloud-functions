const functions = require('firebase-functions');
const admin = require('firebase-admin')
const adminAccount = require('./zipiAdmin/admin.json')
var XMLHttpRequest = require("xmlhttprequest").XMLHttpRequest;
var xhr = new XMLHttpRequest();
const axios = require('axios').default;
const cors = require('cors')({ origin: true});
const  modeTypes = ['Bike', 'Car'];
let apiResp = 'success';
const TeleSignSDK = require('telesignsdk');
const customerId = "FE55B5DA-272D-41AC-9F4C-0ECCBBD62ECC";
const apiKey = "VkT993DvqmaP/ILy3aP4uuxThojiikS0XHF+Hs8bKA8JbNtf5S3yebdRgMigZt37xehTXRe8SsVyLnZJhNgZpA==";
const rest_endpoint = "https://rest-api.telesign.com";
const timeout = 10*1000;
const client = new TeleSignSDK( customerId,
      apiKey,
      rest_endpoint,
      timeout
);


admin.initializeApp({
    credential: admin.credential.cert(adminAccount),
    databaseURL: "https://zipi-app.firebaseio.com"
  });

  exports.sendNotifications =  functions.database.ref('/newTrip/{pushId}/').onCreate((snapshot, context) =>{
      const pushedValues =  snapshot.val();
      let reqKey = Object.keys(pushedValues)
      const messages = new Array();
          let phoneIds =  pushedValues[reqKey].levelZero;        
          const destination = pushedValues[reqKey].do_location;

          for (var x = 0; x < phoneIds.length; x++){
                messages.push({
                  notification:{
                                title : "New Delivery Request!",
                                body: "Pickup From " + destination.replace(', South Africa', ''),
                            },
                            android: {
                                      ttl: 3600 * 1000,
                                      notification: {
                                          sound: 'default'
                                        },
                                    },
                            token: phoneIds[x].phoneId
              })
          }
          admin.messaging().sendAll(messages)
          .then((response) => {
            console.log('Successfully sent message:', response);
            return;
          })
          .catch((error) => {
            console.log('Error sending message:', error);
              return;
          });
  })


  exports.getDistance = functions.https.onRequest((req, res) => {
    return cors(req, res, () => {  
      const key = 'AIzaSyDDMIizZ49AcXojEeG1Qmckb-uduyvX6hY';
      const url = 'https://maps.googleapis.com/maps/api/distancematrix/json?units=metric&origins='+req.query.lat+'&destinations='+req.query.lng+'&key='+key;
      axios.get(url).then(respo =>{
          respo = respo.data;
          const innerData =  respo.rows[0].elements[0].distance.value;
          const finalDistance = innerData / 1000;
          const eta = respo.rows[0].elements[0].duration.text;
          const details = {
            eta : eta,
            distance : finalDistance
          };
          res.send(details)
          return null;
      }).catch(error =>{
          console.log(error)
          res.send(null)
          return null;
      })
    });
  });

  exports.getPlaces = functions.https.onRequest((req, res) =>{
      return cors (req, res,  () =>{
        const url = 'https://maps.googleapis.com/maps/api/place/autocomplete/json?input=' + req.query.address + '&components=country:za&key=AIzaSyDDMIizZ49AcXojEeG1Qmckb-uduyvX6hY';
        axios.get(url).then(response =>{
          response = response.data;
          const predictions = response.predictions;
          res.send(predictions)
          return null;
        }).catch(error =>{
          console.log(error);
          return null;
        })
      })
  })

  exports.sendRequest = functions.https.onRequest((req, res) =>{
    return cors (req, res,  () =>{
      const url = 'https://maps.googleapis.com/maps/api/geocode/json?address=' + req.query.pu_location + '&key=AIzaSyDDMIizZ49AcXojEeG1Qmckb-uduyvX6hY';
      axios.get(url).then(response =>{
        response = response.data;
        response =  response.results[0];
        const loc = response.address_components;
        response = response.geometry.location;
        res.send(getPlaces(loc, req));
        return null;
      }).catch(error =>{
        console.log(error);
        return null;
      })
    })
  })

  function getPlaces(pickUpGeoResults, req){
    let tempArray = new Array();
    for (var x = 0; x < pickUpGeoResults.length; x++) {
        let locations = pickUpGeoResults[x].types
        let counter = false;
        for (var i = 0; i < locations.length; i++) {
            if (locations[i] === "sublocality" || locations[i] === "sublocality_level_1" || locations[i] === "locality" || locations[i] === "administrative_area_level_2") {
                if (!counter) {
                    tempArray.push(pickUpGeoResults[x].short_name);
                    counter = true;
                }
            }
        }
    }
   const retValue = getAvailableDrivers(tempArray, req).then((res) =>{
        return 'passed';
    }).catch(erro =>{
      return 'failed';
    });
    return apiResp;
  }

 function getAvailableDrivers(nearPlaces, req) {
  let searchCounter = 0;
  let tempArray = new Array()
  return new Promise ((resolve, reject) =>{
    for (var a = 0; a < modeTypes.length; a++){
      admin.database().ref(modeTypes[a] + '/').once('value', data => {
            if (data.val() !== null || data.val() !== undefined) {
                let results = data.val();
                let keys = Object.keys(results)
                for (var x = 0; x < keys.length; x++) {
                    if (results[keys[x]].status === "available" && (results[keys[x]].location !== undefined || results[keys[x]].location !== null)) {
                        let location = results[keys[x]].location
                        let found =  false
                        location = location.split(', ');
                        for (var i = 0; i < nearPlaces.length; i++){
                            for (var a = 0; a < location.length; a++){
                                if (location !== 'South Africa'){
                                    if (nearPlaces[i] === location[a]){
                                        found =  true
                                    }
                                }
                            }
                        }
                        if (found){
                            let obj = results[keys[x]];
                            obj.uid = keys[x]
                            if (a === 0){
                              obj.mode = 'Bike';
                            }else if (a === 1){
                              obj.mode = 'Car';
                            }
                            
                            tempArray.push(obj)
                        }
                    }
                }
                  searchCounter = searchCounter + 1
            }
            else{
                searchCounter = searchCounter + 1;
        }
        }).then((respo)=>{
              if (searchCounter > 1){
                const today = new Date();
                const date = today.getFullYear()+'-'+(today.getMonth()+1)+'-'+today.getDate();
                const time = (parseInt(today.getHours()) + 2 ).toString() + ":" + today.getMinutes() + ":" + today.getSeconds();
                const dateTime = date+' '+time;
                const obj = {
                  cellphone : req.query.cellphone,
                  time : time,
                  pu_coords: JSON.parse(req.query.pu_coords),
                  do_coords : JSON.parse(req.query.do_coords),
                  pu_email: req.query.booking_email,
                  pu_location: req.query.pu_location,
                  do_location: req.query.do_location,
                  pu_pin : 1234,
                  pu_pin_node: true,
                  source : "ZipiLite",
                  origin : req.query.origin,
                  uid : req.query.uid,
                  pu_name : "test name",
                  eta : req.query.eta,
                  distance : req.query.distance,
                  accepted: false,
                  cost: 25,
                  amount : 35,
                  booking_ref : Math.floor(Math.random(100000000 - 100) * 100000000),
                  item_insured:"No",
                  mode : "mode",
                  date : dateTime,
                  nearPlaces : nearPlaces,
                  levelZero : tempArray,
                  order_id : req.query.order_id,
                  booking_name : req.query.booking_name ,
                  booking_email: req.query.booking_email,
                  tripId: Math.floor(Math.random(100000000 - 100) * 100000000),
                  instructions : req.query.instructions,
                  shop_number : req.query.shop_number,
                  shop_name : req.query.shop_name
              }
               admin.database().ref('newTrip/' + req.query.uid).push(obj).then((resp) =>{
                 sendAlert(req.query.booking_email, dateTime, tempArray, req.query.booking_name, req.query.mode, req.query.pu_location, req.query.do_location, false, '' )
                 apiResp = 'success';
                resolve ('success');
                return 'success';
              }).catch(error =>{
                apiResp = error.message;
                console.log(error)
                reject (error)
                return 'failed';
              })
            }
            apiResp = 'success';
            resolve('success');
            return 'success';
        }).catch(error =>{
          console.log(error)
          apiResp = error.message;
          reject (error)
          return 'failed';
        })
      }
  })
}

function sendAlert(email, date, data, name, selectedMode, pickUp, dropOff, state, price){
  if (state){
    let url = 'https://zipi.co.za/new_request.php?email=' + email + '&name=' + name + '&date=' + date + '&vehicle=' + selectedMode + '&location=' + pickUp + '&total=' + price + '&dropoff_address=' + dropOff + '&mode=' + selectedMode;
    xhr.open('GET', url, true);
    xhr.onreadystatechange = () => {
        if(xhr.readyState === '4' & xhr.status === '200'){
          console.log('sent')
        }
    }
    xhr.send();
  }else{

        let tempArray = data;
          if (tempArray[0].name === undefined){
            tempArray.splice(0,1)
        }

        if ( tempArray[0].name === undefined){
          tempArray.splice(0,1)
        }

        if (tempArray.length <= 2){
            let obj = {
                name : '',
                cell : ''
            }
            tempArray.push(obj)
        }

        let url = 'https://zipi.co.za/new_request.php?email=' + email + '&name=' + name + '&date=' + date + '&vehicle=' + selectedMode + '&location=' + pickUp + '&total=' + 35 + '&dropoff_address=' + dropOff + '&mode=' + selectedMode +
        '&driverName1=' + tempArray[0].name + '&d_phone1=' + tempArray[0].cell + '&driverName2=' + tempArray[1].name + '&d_phone2=' + tempArray[1].cell + '&driverName3=' + tempArray[2].name + '&d_phone3=' + tempArray[2].cell;
        xhr.open('GET', url, true);
        xhr.onreadystatechange = () => {
            if(xhr.readyState === '4' & xhr.status === '200'){
              console.log('sent')
            }
        }
        xhr.send();
      }
}


exports.messageDrivers = functions.https.onRequest((req, resp) =>{
  return cors (req, resp, () =>{
    let tempArray = new Array();
    let counter =0;
    for (var a = 0; a < modeTypes.length; a++){
      admin.database().ref(modeTypes[a]).once('value', data => {
          if (data.val() !== null || data.val() !== undefined) {
                let results = data.val();
                let keys = Object.keys(results)
                for (var x = 0; x < keys.length; x++) {
                    tempArray.push(results[keys[x]].phoneId)
                }
          }
      }).then(() =>{
        counter = counter + 1;
        if (counter === 2){
          console.log('got drivers');
          resp.send(sendMessage(tempArray, req.query.subject, req.query.msg));
        }
        return null;
      }).catch(error => {
        console.log(error)
        return null;
      })
      resp.send('loop is done');
    }
  })
})

function sendMessage(phoneIds, subject, msg){
 // phoneIds = ["dyebEWwlVBI:APA91bFJrushmRko-Xrf495nwVOmj8r1Wuqk7OovB0UHvXKW5whzujl7Uv0q_Y7RmUQiKSn2493wmY4uV4LVmezAJKnJaVRPcFOk3QYdoGz2p0ur8RdLPGECh2PAxSSAOkj6pegcTOhl", "ctxSd-W-nOk:APA91bE7TDkNRowy0QmmMvI6ZrBgqqQpVMay0HqtgtYhEJpXOLSyl-71JKheECQyVu4mrwY9qxEG_E_APuDKgCJjkNSUg9eqUuEn9fGzhkFrrAnQvTnP0h975vrGVGKmKx5ARLWj7TGg" ]
 let messages = new Array();
      for (var x = 0; x < phoneIds.length; x++){
        messages.push({
          notification:{
                        title : subject,
                        body: msg,
                    },
                    android: {
                              ttl: 3600 * 1000,
                              notification: {
                                  sound: 'default'
                                },
                            },
                    token: phoneIds[x]
      })
    }
    admin.messaging().sendAll(messages)
    .then((response) => {
    console.log('Successfully sent message:', response);
    return;
    })
    .catch((error) => {
    console.log('Error sending message:', error);
      return;
    });
}

exports.sendxRequest = functions.https.onRequest((req, res) =>{
  return cors (req, res,  () =>{
        const today = new Date();
        const date = today.getFullYear()+'-'+(today.getMonth()+1)+'-'+today.getDate();
        const time = (parseInt(today.getHours()) + 2 ).toString() + ":" + today.getMinutes() + ":" + today.getSeconds();
        const dateTime = date+' '+time;
        const obj = {
          cellphone : req.query.cellphone,
          time : time,
          do_coords : JSON.parse(req.query.do_coords),
          pu_email: req.query.booking_email,
          do_location: req.query.do_location,
          pu_pin : Math.floor(Math.random(100000000 - 100) * 100000000),
          pu_pin_node: true,
          source : "ZipiLite",
          origin : req.query.origin,
          uid : req.query.uid,
          pu_name : "test name",
          eta : req.query.eta,
          distance : req.query.distance,
          accepted: false,
          cost: 25,
          locState : false,
          amount : req.query.price,
          booking_ref : Math.floor(Math.random(100000000 - 100) * 100000000),
          item_insured:"No",
          date : dateTime,
          order_id : req.query.order_id,
          booking_name : req.query.booking_name ,
          booking_email: req.query.booking_email,
          tripId: Math.floor(Math.random(100000000 - 100) * 100000000),
          instructions : req.query.instructions,
          pu_location : req.query.clientAddress,
          email : req.query.clientEmail
      }
      admin.database().ref('newReq/').push(obj).then((resp) =>{
        sendAlert(req.query.booking_email, dateTime, [], req.query.booking_name, '', req.query.clientAddress, req.query.do_location, true, req.query.price)
          res.send('success');
          return;
      }).catch(error =>{
        console.log(error)
          res.send ('failed');
          return;
      })
    })
})


exports.sortRequests =  functions.database.ref('/newReq/{pushId}/').onCreate((snapshot, context) =>{
  const pushedValues =  snapshot.val();
  const key = context.params.pushId;
    const url = 'https://maps.googleapis.com/maps/api/geocode/json?address=' + pushedValues.do_location + '&key=AIzaSyDDMIizZ49AcXojEeG1Qmckb-uduyvX6hY';
    axios.get(url).then(response =>{
      response = response.data;
      response =  response.results[0];
      const loc = response.address_components;
      response = response.geometry.location;
      return sortPlaces(loc, key);
    }).catch(error =>{
      console.log(error);
      return error;
    })
})

function sortPlaces (dropOffCoords, key){
  let tempArray = new Array();
  for (var x = 0; x < dropOffCoords.length; x++) {
      let locations = dropOffCoords[x].types;
      let counter = false;
      for (var i = 0; i < locations.length; i++) {
          if (locations[i] === "sublocality" || locations[i] === "sublocality_level_1" || locations[i] === "locality"){
              if (!counter) {
                  tempArray.push(dropOffCoords[x].short_name);
                  counter = true;
              }
          }
      }
  }
  
  return checkLocation(tempArray, key);
}

function checkLocation (locArray, key){
  let tempArray = new Array();
  let found = false;
    admin.database().ref('apiReq/').once('value', data =>{
        if (data.val()){
          let details = data.val();
          let keys = Object.keys(details);
          for (var x = 0; x < keys.length; x++){
            let innerArray = details[keys[x]].locationArray;
            for(var a = 0; a < innerArray.length; a++){
              for (var i = 0;  i < locArray.length; i++){
                if ((locArray[i] === innerArray[a]) && details[keys[x]].selected === false){
                    let arr =  details[keys[x]].reqKeys;
                    arr.push(key)
                    if (!found){
                      admin.database().ref('apiReq/' + keys[x]).update({reqKeys: arr, packagesNumber : arr.length});
                    }
                    found = true
                    break;
                }
              }
            }
          }
          if (!found){
            tempArray.push(key)
            admin.database().ref('apiReq/').push({
              locationArray : locArray,
              reqKeys : tempArray,
              packagesNumber : 1,
              distance : 20,
              verified: false,
              pin : Math.floor(Math.random(100000000 - 100) * 100000000),
              id : Math.floor(Math.random(100000000 - 100) * 100000000),
              selected : false
            })
            return 'finished'
          }else{
            return 'done'
          }
        }else{
          tempArray.push(key)
          admin.database().ref('apiReq/').push({
            locationArray : locArray,
            reqKeys : tempArray,
            packagesNumber : 1,
            distance : 20,
            verified: false,
            pin : Math.floor(Math.random(100000000 - 100) * 100000000),
            id : Math.floor(Math.random(100000000 - 100) * 100000000),
            selected : false
          }).then(() =>{
            return ' done adding new one';
          }).catch(error =>{
            console.log(error)
            return error;
          })
        }
    }).catch(error =>{
      console.log(error)
      return error;
    })
}


exports.cancelRequest = functions.https.onRequest((req, res) =>{
  return cors (req, res,  () =>{ 
    let tempArray = new Array();
    admin.database().ref('apiReq/' + req.query.parentKey).once('value', data =>{
      const details =  data.val();
      const keys = details.reqKeys;
      let found = false;
      for (var x = 0; x < keys.length; x++){
        if (keys[x] === req.query.childKey){
          if (!found){
            let arr  = new Array();
            for (var i = 0; i <  keys.length; i++){
              if (keys[i] !== req.query.childKey){
                arr.push(keys[i]);
              }
            }
            admin.database().ref('apiReq/' + req.query.parentKey).update({reqKeys : arr, packagesNumber : arr.length}).then(() =>{
              tempArray.push(req.query.childKey)
              admin.database().ref('apiReq/').push({
                locationArray : details.locationArray,
                reqKeys : tempArray,
                packagesNumber : 1,
                distance : 20,
                pin : Math.floor(Math.random(100000000 - 100) * 100000000),
                id : Math.floor(Math.random(100000000 - 100) * 100000000),
                selected : false, 
                verified: false
              }).then(() =>{
                return ' done adding new one';
              }).catch(error =>{
                console.log(error)
                return error;
              })
              return 'removed'
            }).catch(error =>{
              console.log(error)
            })
          }
          found = true;
          break;
        }
      }
      res.send('success');
      return 'success'
    }).catch(erro =>{
      res.send('failed')
      console.log(erro)
      return erro
    })
  })
})


exports.sendSms = functions.https.onRequest((req, res) =>{
  return cors (req, res,  () =>{ 
    const phoneNumber = req.query.cellphone;
    const message = req.query.message;
    const messageType = "ARN";
  
    function messageCallback(error, responseBody) {
        if (error === null) {
            console.log(`${phoneNumber}` +
                ` => code: ${responseBody['status']['code']}` +
                `, description: ${responseBody['status']['description']}`);
                res.send('done')
                return 'passed'
        } else {
            console.error("Unable to send message. " + error);
            res.send(error)
            return 'failed'
        }
    }
    client.sms.message(messageCallback, phoneNumber, message, messageType);
  })
})






