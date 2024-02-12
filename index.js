const noble = require('@abandonware/noble');
const zmq = require('zeromq');
const fs = require('node:fs');
const { log } = require('node:console');

var record = false;
var file;
var startTimestamp;

async function runServer() {
  const sock = new zmq.Reply();

  await sock.bind('tcp://*:5555');

  for await (const [msg] of sock) {
    if (msg.toString().startsWith("start")) {
      record = true
      startTimestamp = new Date().getTime();
      var filename = msg.toString().split(":")[1];
      file = fs.createWriteStream(filename + '.csv', {flags: 'a'});
      log("Start recording...");
      await sock.send('OK');
    } else if (msg.toString() == "stop") {
      record = false
      file.close();
      log("Stop recording...");
      await sock.send('OK');
    } else {
      await sock.send('ERROR');
      log("Unknown command");
    }
  }
}

noble.on('stateChange', function(state) {
  if (state === 'poweredOn') {
    // Seek for peripherals broadcasting the heart rate service
    // This will pick up a Polar H7 and should pick up other ble heart rate bands
    // Will use whichever the first one discovered is if more than one are in range
    noble.startScanning(["180d"]);
  } else {
    noble.stopScanning();
  }
});

noble.on('discover', function(peripheral) {
  // Once peripheral is discovered, stop scanning
  noble.stopScanning();

  // connect to the heart rate sensor
  peripheral.connect(function(error){
    // 180d is the bluetooth service for heart rate:
    // https://developer.bluetooth.org/gatt/services/Pages/ServiceViewer.aspx?u=org.bluetooth.service.heart_rate.xml
    var serviceUUID = ["180d"];
    // var serviceUUID = ["180f"];
    // 2a37 is the characteristic for heart rate measurement
    // https://developer.bluetooth.org/gatt/characteristics/Pages/CharacteristicViewer.aspx?u=org.bluetooth.characteristic.heart_rate_measurement.xml
    var characteristicUUID = ["2a37"];
    // var characteristicUUID = ["2a19"];

    // use noble's discoverSomeServicesAndCharacteristics
    // scoped to the heart rate service and measurement characteristic
    peripheral.discoverSomeServicesAndCharacteristics(serviceUUID, characteristicUUID, function(error, services, characteristics){
      characteristics[0].notify(true, function(error){
        characteristics[0].on('data', function(data, isNotification){
          var line = ""

          const date = new Date();
          
          options = {
            "hour": "2-digit",
            "minute": "2-digit",
            "second": "2-digit",
            "fractionalSecondDigits": 3
          }
          process.stdout.write("[" + date.toLocaleTimeString('de-DE', options)+ "] ")
          line += new Date().getTime() - startTimestamp + ",";
          process.stdout.write('BPM: ' + data[1] + ", RR: ");
          line += data[1] + ",";
          for (var i = 0; i < (data.length-2)/2; i++) {
            process.stdout.write((data.readUint16LE(2+2*i)/1024).toPrecision(2) + " ");
            line += (data.readUint16LE(2+2*i)/1024).toPrecision(2) + ",";
          }
          console.log("");
          line += "\n";

          if (record) {
            file.write(line);
          }
        });
      });
    });
  });
});

runServer();
