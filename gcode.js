// ---- Setup ----
document.getElementById("sendSetupBtn").addEventListener("click", async () => {
    const lines = document.getElementById("setupInput").value.split("\n");
    for(const line of lines){
        const command = line.trim();
        if(command !== "") await sendGcode(command);
    }
});

// ---- Jog buttons (+/- on each axis) ----
document.querySelectorAll(".jog-btn").forEach(btn => {
    btn.addEventListener("click", async () => {
        const axis = btn.dataset.axis;
        const dir = Number(btn.dataset.dir);
        const stepInput = document.getElementById("step" + axis);
        const step = Number(stepInput.value) || 0;
        const distance = (step * dir).toFixed(3).replace(/\.?0+$/, "");
        await sendGcode(`G0 ${axis}${distance}`);
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
