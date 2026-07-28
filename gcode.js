// ---- Setup ----
document.getElementById("sendSetupBtn").addEventListener("click", async () => {
    const lines = document.getElementById("setupInput").value.split("\n");
    for(const line of lines){
        const command = line.trim();
        if(command !== "") await sendGcode(command);
    }
});

// ---- axis linking: e.g. link X and Y so a jog press moves both at once,
// sending a single combined line like "G0 X2 Y2 F1000" ----
const linkedPairs = { "X-Y": false, "Y-Z": false };

document.querySelectorAll(".axis-link-btn").forEach(btn => {
    btn.addEventListener("click", () => {
        const pair = btn.dataset.pair;
        linkedPairs[pair] = !linkedPairs[pair];
        btn.classList.toggle("linked", linkedPairs[pair]);
        logLine(linkedPairs[pair] ? `Linked ${pair.replace("-", " + ")}` : `Unlinked ${pair.replace("-", " + ")}`);
    });
});

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

function axisMoveToken(axis, dir){
    const step = Number(document.getElementById("step" + axis).value) || 0;
    const distance = (step * dir).toFixed(3).replace(/\.?0+$/, "");
    return `${axis}${distance}`;
}

// ---- Jog buttons (+/- on each axis) ----
document.querySelectorAll(".jog-btn").forEach(btn => {
    btn.addEventListener("click", async () => {
        const axis = btn.dataset.axis;
        const dir = Number(btn.dataset.dir);
        const feedInput = document.getElementById("feed" + axis);
        const feed = Number(feedInput.value) || 1000;

        const tokens = [axisMoveToken(axis, dir)];
        getLinkedNeighbors(axis).forEach(n => tokens.push(axisMoveToken(n, dir)));

        await sendGcode(`G0 ${tokens.join(" ")} F${feed}`);
    });
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
