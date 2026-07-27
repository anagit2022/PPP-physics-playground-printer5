// ---- shared WebSerial connection logic, used by playground.html and
// gcode.html. Both pages need: an element with id="connectButton",
// id="connectStatus", and id="console" in their HTML. ----

let port;
let writer;

const consoleDiv = document.getElementById("console");
const connectStatus = document.getElementById("connectStatus");

document.getElementById("connectButton").addEventListener("click", connectPrinter);

async function connectPrinter(){
    try{
        port = await navigator.serial.requestPort();
        await port.open({ baudRate: 115200 });
        writer = port.writable.getWriter();
        connectStatus.textContent = "Connected";
        logLine("Connected!");
        readLoop(); // start listening for the printer's "ok" responses
    }catch(err){
        connectStatus.textContent = "Connection failed";
        logLine("Error: " + err.message);
    }
}

// ---- reading responses back from the printer ----
let lineBuffer = "";
let pendingOkResolve = null;

async function readLoop(){
    const decoder = new TextDecoderStream();
    port.readable.pipeTo(decoder.writable); // don't await, runs for life of connection
    const reader = decoder.readable.getReader();
    try{
        while(true){
            const { value, done } = await reader.read();
            if(done) break;
            if(value){
                lineBuffer += value;
                const lines = lineBuffer.split("\n");
                lineBuffer = lines.pop(); // last chunk may be incomplete, keep for next read
                for(let line of lines){
                    line = line.trim();
                    if(line === "") continue;
                    logLine("&lt; " + line);
                    if(line.toLowerCase().includes("ok") && pendingOkResolve){
                        pendingOkResolve();
                        pendingOkResolve = null;
                    }
                }
            }
        }
    }catch(err){
        logLine("Read error: " + err.message);
    }
}

// waits for the next "ok", but gives up after timeoutMs so a dropped
// response can't hang the whole experiment forever
function waitForOk(timeoutMs = 5000){
    return new Promise(resolve => {
        let settled = false;
        pendingOkResolve = () => {
            if(settled) return;
            settled = true;
            resolve();
        };
        setTimeout(() => {
            if(settled) return;
            settled = true;
            pendingOkResolve = null;
            logLine("(no ok received, continuing anyway)");
            resolve();
        }, timeoutMs);
    });
}

async function sendGcode(command){
    if(!writer){
        logLine("Not connected - command not sent: " + command);
        return;
    }
    const encoder = new TextEncoder();
    await writer.write(encoder.encode(command + "\n"));
    logLine("&gt; " + command);
    await waitForOk();
}

function logLine(text){
    consoleDiv.innerHTML += text + "<br>";
    consoleDiv.scrollTop = consoleDiv.scrollHeight;
}
