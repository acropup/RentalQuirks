/* This code depends on the Zebra Browser Print library. Files to include are:
   - BrowserPrint-3.0.216.min.js
   - BrowserPrint-Zebra-1.0.216.min.js
   Global variables created from these files:
   - window.BrowserPrint
   - window.Zebra
   Note that both RentalWorks code (ex. script1-2019.1.2.206.js) and the Zebra Browser Print library use
   Closure Compiler, which creates the global window.$jscomp variable. I don't know if there's any risk 
   of one file clobbering the other, but that's something to keep in mind.
*/
(function (RQ) {
    'use strict';
    let devices = [];
    let selected_device;

    function setup() {
        //Get the default device from the application as a first step. Discovery takes longer to complete.
        BrowserPrint.getDefaultDevice("printer", function(device) {
    
            //Add device to list of devices and to html select element
            selected_device = device;
            devices.push(device);
            var html_select = document.getElementById("selected_device");
            var option = document.createElement("option");
            option.text = device.name;
            html_select.add(option);
            
            //Discover any other devices available to the application
            BrowserPrint.getLocalDevices(function(device_list) {
                for(var i = 0; i < device_list.length; i++) {
                    //Add device to list of devices and to html select element
                    var device = device_list[i];
                    if(!selected_device || device.uid != selected_device.uid) {
                        devices.push(device);
                        var option = document.createElement("option");
                        option.text = device.name;
                        option.value = device.uid;
                        html_select.add(option);
                    }
                }
                
            }, function(){notifyUser("Error getting local devices")},"printer");
            
        }, function(error) { notifyUser(error); });
    }

    function writeToSelectedPrinter(dataToWrite) {
        selected_device.send(dataToWrite, undefined, errorCallback);
    }
    var readCallback = function(readData) {
        if(readData === undefined || readData === null || readData === "") {
            notifyUser("No Response from Device");
        }
        else {
            notifyUser(readData);
        }
    }
    var errorCallback = function(errorMessage){
        notifyUser("Error: " + errorMessage);	
    }
    function readFromSelectedPrinter() {
        selected_device.read(readCallback, errorCallback);
    }
    function onDeviceSelected(selected) {
        for(var i = 0; i < devices.length; ++i) {
            if(selected.value == devices[i].uid) {
                selected_device = devices[i];
                return;
            }
        }
    }
    function notifyUser () {
        alert(...arguments);
        console.log(...arguments);
    }


    RQ.runOnAppLoad.push(()=>{
        console.log('barcoding');
        let z = document.createElement('div');
        z.id = 'rq-zebra-print';
        z.innerHTML = `<h1>Barcode Print Utility</h1>
        Selected Device: <select id="selected_device" onchange="onDeviceSelected(this);"></select>
        <input type="text" name="write_text" id="write_text">
        <input type="button" value="Write" onclick="writeToSelectedPrinter(document.getElementById('write_text').value)"><br/><br/>
        <h2>Code 128 Barcode Preview</h2>
        <label>Enter a text: <input type="text" name="to-encode" class="code128-encoder_input"></label>
        <p>If it can be encoded with Code&nbsp;128 you will see a scannable barcode, rendered with the <strong>Libre Barcode 128 Text</strong> font.</p>

    <div class="code128-encoder_display">ÌHello World!WÎ</div>

    <p><label> Copy the encoded text to use it with one of the <a href="https://fonts.google.com/?query=Libre+Barcode+128">Libre&nbsp;Barcode&nbsp;128&nbsp;fonts</a>:<br>
    <input type="text" readonly="" class="code128-encoder_output"></label></p>`;
        let app_elem = document.getElementById('fw-app');
        app_elem.appendChild(z);
    });




function initEncoder(){
            var codeContainer = document.body.getElementsByClassName('code128-encoder_display')[0]
              , inputElement = document.body.getElementsByClassName('code128-encoder_input')[0]
              , outputElement = document.body.getElementsByClassName('code128-encoder_output')[0]
              ;

            inputElement.addEventListener('input', function(){
                var result = encode(inputElement.value);
                codeContainer.textContent = result || '';
                outputElement.value = result || '';
            })
            outputElement.addEventListener('click', outputElement.select);
            inputElement.value = 'Hello World!';
            inputElement.dispatchEvent(new Event('input'));
        }







})(window.RentalQuirks);