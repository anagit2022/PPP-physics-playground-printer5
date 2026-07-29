// ---- Setup ----
document.getElementById("sendSetupBtn").addEventListener("click", async () => {
    const lines = document.getElementById("setupInput").value.split("\n");
    for(const line of lines){
        const command = line.trim();
        if(command !== "") await sendGcode(command);
    }
});

// ---- axis linking: drag between the dots above each panel to link two
// axes, so a jog press moves both at once as one combined line like
// "G0 X2 Z2 F1000". Click an existing curve to unlink. ----
const linkedPairs = { "X-Y": false, "Y-Z": false, "X-Z": false };

const jogArea = document.getElementById("jogArea");
const jogLinksSvg = document.getElementById("jogLinksSvg");
const SVG_NS = "http://www.w3.org/2000/svg";

function pairKey(a, b){
    return [a, b].sort().join("-");
}

// returns the axis letter(s) directly linked to this one
function getLinkedNeighbors(axis){
    const neighbors = [];
    Object.keys(linkedPairs).forEach(pair => {
        if(!linkedPairs[pair]) return;
        const [a, b] = pair.split("-");
        if(a === axis) neighbors.push(b);
        if(b === axis) neighbors.push(a);
    });
    return neighbors;
}

function nodeCenter(axis){
    const node = document.querySelector(`.jog-node[data-axis="${axis}"]`);
    const nodeRect = node.getBoundingClientRect();
    const areaRect = jogArea.getBoundingClientRect();
    return {
        x: nodeRect.left + nodeRect.width / 2 - areaRect.left,
        y: nodeRect.top + nodeRect.height / 2 - areaRect.top
    };
}

function areaPoint(clientX, clientY){
    const areaRect = jogArea.getBoundingClientRect();
    return { x: clientX - areaRect.left, y: clientY - areaRect.top };
}

function curvePathD(p1, p2){
    const midX = (p1.x + p2.x) / 2;
    const lift = Math.min(p1.y, p2.y) - 30;
    return `M ${p1.x} ${p1.y} Q ${midX} ${lift} ${p2.x} ${p2.y}`;
}

function redrawLinks(){
    jogLinksSvg.querySelectorAll(".jog-link-path").forEach(p => p.remove());

    Object.keys(linkedPairs).forEach(key => {
        if(!linkedPairs[key]) return;
        const [a, b] = key.split("-");
        const path = document.createElementNS(SVG_NS, "path");
        path.setAttribute("class", "jog-link-path");
        path.setAttribute("d", curvePathD(nodeCenter(a), nodeCenter(b)));
        path.addEventListener("click", () => {
            linkedPairs[key] = false;
            logLine(`Unlinked ${key.replace("-", " + ")}`);
            redrawLinks();
        });
        jogLinksSvg.appendChild(path);
    });

    document.querySelectorAll(".jog-node").forEach(node => {
        node.classList.toggle("linked", getLinkedNeighbors(node.dataset.axis).length > 0);
    });
}

// ---- drag from one node to another to create a link ----
document.querySelectorAll(".jog-node").forEach(node => {
    node.addEventListener("mousedown", (e) => {
        e.preventDefault();
        const fromAxis = node.dataset.axis;

        const tempPath = document.createElementNS(SVG_NS, "path");
        tempPath.setAttribute("class", "jog-link-temp");
        jogLinksSvg.appendChild(tempPath);

        function onMove(ev){
            tempPath.setAttribute("d", curvePathD(nodeCenter(fromAxis), areaPoint(ev.clientX, ev.clientY)));
        }

        function onUp(ev){
            document.removeEventListener("mousemove", onMove);
            document.removeEventListener("mouseup", onUp);
            tempPath.remove();

            const target = document.elementFromPoint(ev.clientX, ev.clientY);
            const targetNode = target && target.closest(".jog-node");
            if(targetNode && targetNode.dataset.axis !== fromAxis){
                const key = pairKey(fromAxis, targetNode.dataset.axis);
                if(!linkedPairs[key]){
                    linkedPairs[key] = true;
                    logLine(`Linked ${key.replace("-", " + ")}`);
                    redrawLinks();
                }
            }
        }

        document.addEventListener("mousemove", onMove);
        document.addEventListener("mouseup", onUp);
    });
});

window.addEventListener("resize", redrawLinks);
redrawLinks();

function axisMoveToken(axis, dir){
    const step = Number(document.getElementById("step" + axis).value) || 0;
    const distance = (step * dir).toFixed(3).replace(/\.?0+$/, "");
    return `${axis}${distance}`;
}

async function doJogMove(axis, dir){
    const feedInput = document.getElementById("feed" + axis);
    const feed = Number(feedInput.value) || 1000;

    const tokens = [axisMoveToken(axis, dir)];
    getLinkedNeighbors(axis).forEach(n => tokens.push(axisMoveToken(n, dir)));

    await sendGcode(`G0 ${tokens.join(" ")} F${feed}`);
}

// ---- Jog buttons (+/- on each axis): press and hold to keep moving ----
document.querySelectorAll(".jog-btn").forEach(btn => {
    let holding = false;

    async function startHold(){
        if(holding) return; // already looping from an earlier press
        holding = true;
        const axis = btn.dataset.axis;
        const dir = Number(btn.dataset.dir);
        // each iteration waits for the printer's "ok" (inside sendGcode),
        // so this can't outrun what the printer can actually execute
        while(holding){
            await doJogMove(axis, dir);
        }
    }

    function stopHold(){
        holding = false;
    }

    btn.addEventListener("mousedown", (e) => { e.preventDefault(); startHold(); });
    btn.addEventListener("mouseup", stopHold);
    btn.addEventListener("mouseleave", stopHold);
    btn.addEventListener("touchstart", (e) => { e.preventDefault(); startHold(); }, { passive: false });
    btn.addEventListener("touchend", stopHold);
    btn.addEventListener("touchcancel", stopHold);
});

// ---- Quick command: send one or more lines, optionally repeated ----
let stopQuickCommand = false;

document.getElementById("sendQuickCommandBtn").addEventListener("click", async () => {
    stopQuickCommand = false;
    const sendBtn = document.getElementById("sendQuickCommandBtn");
    sendBtn.disabled = true;

    const lines = document.getElementById("quickCommandInput").value
        .split("\n")
        .map(l => l.trim())
        .filter(l => l !== "");

    const repeatCount = Math.max(1, Number(document.getElementById("repeatCountInput").value) || 1);

    if(lines.length === 0){
        alert("Type at least one G-code command first.");
        sendBtn.disabled = false;
        return;
    }

    for(let i = 0; i < repeatCount; i++){
        if(stopQuickCommand) break;
        for(const line of lines){
            if(stopQuickCommand) break;
            await sendGcode(line);
        }
    }

    logLine(stopQuickCommand ? "Quick command stopped" : "Quick command finished");
    sendBtn.disabled = false;
});

document.getElementById("stopQuickCommandBtn").addEventListener("click", () => {
    stopQuickCommand = true;
    logLine("Stopping quick command...");
});
