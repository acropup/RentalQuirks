
(function (RQ) {
    'use strict';
    
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