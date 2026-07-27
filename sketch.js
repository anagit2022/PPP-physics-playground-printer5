// ---- Google Drive config, shared with observation.js (video uploads)
// and used below for syncing saved experiments. Paste your deployed
// Apps Script URL (ends in /exec) and the SECRET you set inside
// DriveUpload.gs. This file is sent to the browser as plain text, so
// anyone who opens dev tools can read these values — fine for a
// personal tool, just don't publish this page anywhere public.
const DRIVE_SCRIPT_URL = "PASTE_YOUR_APPS_SCRIPT_URL_HERE"; // e.g. https://script.google.com/macros/s/AKfycb.../exec
const DRIVE_SECRET = "changeme123"; // must match SECRET in DriveUpload.gs

let stopProgram = false;

const motionPreview = document.getElementById("motionPreview");
const playButton = document.getElementById("playButton");
const slidersContainer = document.getElementById("slidersContainer");

// ---------------- Dynamic sliders ----------------
// Each slider has its own "token" — whatever you type in that little box
// next to the title is exactly what you write in curly braces in Motion,
// e.g. token "Y" -> use {Y} in the Motion box. No hidden parsing/guessing:
// what you see in the token box is what gets matched, always.
const TEMPLATE_PRESETS = {
    resonance: {
        label: "Resonance experiment",
        motion: "G0 Y{Y} F{F}\nG0 Y-{Y} F{F}",
        sliders: [
            { id: "amp",   title: "Amplitude", token: "Y",     hint: "By how much dist is the bed pushed?", min: 0,   max: 50,   step: 1,   value: 5 },
            { id: "speed", title: "Speed",     token: "F",     hint: "How fast is the position changed?",   min: 100, max: 6000, step: 100, value: 3000 },
            { id: "freq",  title: "Frequency", token: "REPEAT",hint: "How many times to repeat the motion", min: 1,   max: 100,  step: 1,   value: 5 },
        ]
    },
    pulley: {
        label: "Pulley system experiment",
        motion: "G0 Z{LIFT} F{F}\nG0 Z-{LIFT} F{F}",
        sliders: [
            { id: "lift",  title: "Lift height", token: "LIFT", hint: "How far the pulley lifts the load", min: 0,   max: 100,  step: 1,   value: 20 },
            { id: "speed", title: "Lift speed",   token: "F",    hint: "How fast the pulley raises/lowers", min: 100, max: 3000, step: 100, value: 800 },
            { id: "freq",  title: "Cycles",       token: "REPEAT", hint: "How many lift/lower cycles",      min: 1,   max: 50,   step: 1,   value: 3 },
        ]
    }
};

const SAVED_EXPERIMENTS_KEY = "physicsPlaygroundExperiments";

function getSavedExperiments(){
    try{
        return JSON.parse(localStorage.getItem(SAVED_EXPERIMENTS_KEY)) || [];
    }catch(e){
        return [];
    }
}

function setSavedExperiments(list){
    localStorage.setItem(SAVED_EXPERIMENTS_KEY, JSON.stringify(list));
}

const urlParams = new URLSearchParams(window.location.search);
const activeTemplate = urlParams.get("template");
const templatePreset = TEMPLATE_PRESETS[activeTemplate];

const experimentId = urlParams.get("experiment");
const loadedExperiment = experimentId
    ? getSavedExperiments().find(e => e.id === experimentId) || null
    : null;

let sliders;
if(loadedExperiment){
    sliders = loadedExperiment.sliders.map(s => ({ ...s }));
}else if(templatePreset){
    sliders = templatePreset.sliders.map(s => ({ ...s }));
}else{
    sliders = [
        { id: "amp",   title: "Amplitude", token: "Y",      hint: "By how much dist is the bed pushed?",     min: 0,   max: 50,   step: 1,   value: 5 },
        { id: "speed", title: "Speed",     token: "F",       hint: "How fast is the position changed?",       min: 100, max: 6000, step: 100, value: 3000 },
        { id: "freq",  title: "Frequency", token: "REPEAT",  hint: "How many times to repeat the motion",     min: 1,   max: 100,  step: 1,   value: 5 },
    ];
}
let sliderSeq = sliders.length;

const templateLabelEl = document.getElementById("templateLabel");
if(templateLabelEl){
    templateLabelEl.textContent = loadedExperiment
        ? `Saved experiment: ${loadedExperiment.name}`
        : (templatePreset ? templatePreset.label : "Custom experiment");
}

const motionInputEl = document.getElementById("motionInput");
const setupInputEl = document.getElementById("setupInput");
if(loadedExperiment){
    if(motionInputEl) motionInputEl.value = loadedExperiment.motion;
    if(setupInputEl) setupInputEl.value = loadedExperiment.setup;
}else if(templatePreset){
    if(motionInputEl) motionInputEl.value = templatePreset.motion;
}

function escapeAttr(str){
    return String(str).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
}


function renderAllSliders(){
    slidersContainer.innerHTML = "";
    sliders.forEach(renderSliderPanel);
}

function renderSliderPanel(def){
    const panel = document.createElement("div");
    panel.className = "panel slider-panel";
    panel.dataset.id = def.id;

    panel.innerHTML = `
        <div class="panel-header">
            <input type="text" class="slider-title-input" value="${escapeAttr(def.title)}">
            <div class="value-box">
                <input type="text" class="slider-token-input" maxlength="10" value="${escapeAttr(def.token)}">
                <input type="number" class="slider-value-input" value="${def.value}" min="${def.min}" max="${def.max}" step="${def.step}">
            </div>
            <button type="button" class="delete-slider-btn" title="Delete this slider">&times;</button>
        </div>
        <input type="text" class="slider-hint-input" value="${escapeAttr(def.hint)}">
        <input type="range" class="slider-range" min="${def.min}" max="${def.max}" step="${def.step}" value="${def.value}">
        <div class="slider-minmax-row">
            <label>Min <input type="number" class="slider-min-input" value="${def.min}"></label>
            <label>Max <input type="number" class="slider-max-input" value="${def.max}"></label>
            <label>Step <input type="number" class="slider-step-input" value="${def.step}"></label>
        </div>
        <div class="slider-buttons">
            <button type="button" class="step-btn" data-dir="-1">&minus;</button>
            <button type="button" class="step-btn" data-dir="1">+</button>
        </div>
    `;

    slidersContainer.appendChild(panel);
    bindSliderPanel(panel, def);
}

function bindSliderPanel(panel, def){
    const titleInput = panel.querySelector(".slider-title-input");
    const tokenInput = panel.querySelector(".slider-token-input");
    const valueInput = panel.querySelector(".slider-value-input");
    const hintInput = panel.querySelector(".slider-hint-input");
    const range = panel.querySelector(".slider-range");
    const minInput = panel.querySelector(".slider-min-input");
    const maxInput = panel.querySelector(".slider-max-input");
    const stepInput = panel.querySelector(".slider-step-input");
    const deleteBtn = panel.querySelector(".delete-slider-btn");

    titleInput.addEventListener("input", () => {
        def.title = titleInput.value;
    });

    tokenInput.addEventListener("input", () => {
        def.token = tokenInput.value.trim();
        updateMotionPreview();
    });

    hintInput.addEventListener("input", () => {
        def.hint = hintInput.value;
    });

    function setValue(v){
        v = Math.min(def.max, Math.max(def.min, v));
        def.value = v;
        valueInput.value = v;
        range.value = v;
        updateMotionPreview();
    }

    valueInput.addEventListener("input", () => {
        const v = Number(valueInput.value);
        if(!isNaN(v)) setValue(v);
    });

    range.addEventListener("input", () => {
        setValue(Number(range.value));
    });

    panel.querySelectorAll(".step-btn").forEach(btn => {
        btn.addEventListener("click", () => {
            const dir = Number(btn.dataset.dir);
            setValue(def.value + dir * def.step);
        });
    });

    function applyBounds(){
        range.min = def.min;
        range.max = def.max;
        range.step = def.step;
        valueInput.min = def.min;
        valueInput.max = def.max;
        valueInput.step = def.step;
        setValue(def.value); // re-clamp to new bounds
    }

    minInput.addEventListener("input", () => {
        const v = Number(minInput.value);
        if(!isNaN(v)){ def.min = v; applyBounds(); }
    });
    maxInput.addEventListener("input", () => {
        const v = Number(maxInput.value);
        if(!isNaN(v)){ def.max = v; applyBounds(); }
    });
    stepInput.addEventListener("input", () => {
        const v = Number(stepInput.value);
        if(!isNaN(v) && v > 0){ def.step = v; applyBounds(); }
    });

    deleteBtn.addEventListener("click", () => {
        sliders = sliders.filter(s => s !== def);
        panel.remove();
        updateMotionPreview();
    });
}

document.getElementById("addSliderButton").addEventListener("click", () => {
    sliderSeq++;
    const def = {
        id: "custom" + sliderSeq,
        title: "New slider",
        token: "P" + sliderSeq,
        hint: "Custom parameter",
        min: 0, max: 100, step: 1, value: 0
    };
    sliders.push(def);
    renderSliderPanel(def);
});

renderAllSliders();

// ---- if this experiment wasn't in local storage (e.g. opened on a
// different device), try fetching the shared list from Drive instead ----
if(experimentId && !loadedExperiment && driveConfigured()){
    (async () => {
        try{
            const response = await fetch(DRIVE_SCRIPT_URL, {
                method: "POST",
                headers: { "Content-Type": "text/plain;charset=utf-8" },
                body: JSON.stringify({ action: "listExperiments", secret: DRIVE_SECRET })
            });
            const result = await response.json();
            if(!result.success) throw new Error(result.error || "List failed");

            setSavedExperiments(result.experiments); // cache locally too
            const remote = result.experiments.find(e => e.id === experimentId);

            if(remote){
                sliders = remote.sliders.map(s => ({ ...s }));
                sliderSeq = sliders.length;
                if(motionInputEl) motionInputEl.value = remote.motion;
                if(setupInputEl) setupInputEl.value = remote.setup;
                if(templateLabelEl) templateLabelEl.textContent = `Saved experiment: ${remote.name}`;
                currentExperimentId = remote.id;
                if(typeof showSavedState === "function") showSavedState(remote.name);
                if(remote.thumbnail && typeof renderThumbnailPreview === "function"){
                    chosenThumbnail = remote.thumbnail;
                    renderThumbnailPreview();
                }
                renderAllSliders();
                updateMotionPreview();
            }else if(templateLabelEl){
                templateLabelEl.textContent = "Saved experiment not found (deleted, or a bad link?)";
            }
        }catch(err){
            if(templateLabelEl) templateLabelEl.textContent = `Couldn't reach Drive to load this experiment: ${err.message}`;
        }
    })();
}

// ---- pulls out amp/speed/repeat for things that still expect them
// (e.g. the Observation cards "fill from sliders" button) ----
function getValues(){
    const find = id => sliders.find(s => s.id === id);
    const amp = find("amp");
    const speed = find("speed");
    const repeat = find("freq");
    return {
        amp: amp ? amp.value : undefined,
        speed: speed ? speed.value : undefined,
        repeat: repeat ? repeat.value : undefined,
    };
}

// reads the Motion textarea and fills in every slider's {TOKEN} with its
// current value. Also supports simple offsets like {Y+10} or {F-500}.
function buildMotionLines(){
    const template = document.getElementById("motionInput").value.split("\n");
    return template
        .map(line => line.trim())
        .filter(line => line !== "")
        .map(line => line.replace(/\{([^{}+\-]+)([+\-]\d+(?:\.\d+)?)?\}/g, (match, tokenName, offset) => {
            const def = sliders.find(s => s.token === tokenName);
            if(!def) return match; // no matching slider — leave as-is so the warning below can flag it
            let value = def.value;
            if(offset) value += parseFloat(offset);
            return value;
        }));
}

function updateMotionPreview(){
    const rawTemplate = document.getElementById("motionInput").value;
    const preview = buildMotionLines().join("\n");

    // flag any {token} or {token+N}/{token-N} in the text that doesn't
    // match a current slider, so a rename/typo is obvious instead of
    // silently doing nothing
    const tokenMatches = [...rawTemplate.matchAll(/\{([^{}+\-]+)(?:[+\-]\d+(?:\.\d+)?)?\}/g)];
    const knownTokenNames = sliders.map(s => s.token);
    const unmatched = [...new Set(
        tokenMatches.filter(m => !knownTokenNames.includes(m[1])).map(m => m[0])
    )];

    if(unmatched.length > 0){
        motionPreview.innerHTML =
            `<span style="color:#c62828;">&#9888;&#65039; No slider matches ${unmatched.join(", ")} — check the token box on each slider.</span><br><br>${preview}`;
    }else{
        motionPreview.textContent = preview;
    }
}
document.getElementById("motionInput").addEventListener("input", updateMotionPreview);
updateMotionPreview();

// ---------------- WebSerial ----------------
// connectPrinter/sendGcode/logLine etc. now live in serial.js (shared
// with gcode.html) — make sure serial.js is loaded before this file.

// ---------------- Play experiment ----------------
document.getElementById("playButton").addEventListener("click", playExperiment);
document.getElementById("stopButton").addEventListener("click", () => {
    stopProgram = true;
    logLine("Stopping experiment...");
});

// ---------------- Boundary safety ----------------
// Tracks position by adding up relative G0/G1 moves sent since Play was
// pressed. This assumes the machine is actually at 0,0,0 when Play
// starts (e.g. via a G28 in Setup) — it does NOT query the real printer
// position.
let currentPos = { X: 0, Y: 0, Z: 0 };

function getAxisLimit(axis){
    const el = document.getElementById("limit" + axis);
    return el ? Number(el.value) : Infinity;
}

// scans a line for axis moves (e.g. "G0 X5 Y-3 F3000" -> X:+5, Y:-3) and
// checks whether applying them would leave 0..max on any axis. Does NOT
// mutate currentPos — call commitPosition() separately once you've
// decided to actually send the line.
function checkBoundary(line){
    const matches = [...line.matchAll(/([XYZ])(-?[0-9.]+)/g)];
    for(const m of matches){
        const axis = m[1];
        const delta = parseFloat(m[2]);
        const newPos = currentPos[axis] + delta;
        const max = getAxisLimit(axis);
        if(newPos < 0 || newPos > max){
            return { ok: false, axis, newPos, max };
        }
    }
    return { ok: true, matches };
}

function commitPosition(matches){
    matches.forEach(m => {
        currentPos[m[1]] += parseFloat(m[2]);
    });
}

// moves the offending axis back to the middle of its allowed range
async function recenterAxis(axis){
    const max = getAxisLimit(axis);
    const center = max / 2;
    const delta = center - currentPos[axis];
    await sendGcode(`G0 ${axis}${delta.toFixed(3)} F1000`);
    currentPos[axis] = center;
}

async function playExperiment(){
    stopProgram = false;
    playButton.disabled = true;
    currentPos = { X: 0, Y: 0, Z: 0 }; // assumes machine is homed to 0,0,0 right now

    // ---- Setup commands, sent once ----
    const setupCommands = document.getElementById("setupInput").value.split("\n");
    for(let command of setupCommands){
        if(stopProgram) break;
        command = command.trim();
        if(command !== "") await sendGcode(command);
    }

    // ---- Motion loop: runs until Stop is pressed ----
    // buildMotionLines() re-reads the Motion textarea and every slider's
    // current value every pass, so editing the template or dragging a
    // slider takes effect on the next cycle.
    while(!stopProgram){
        const lines = buildMotionLines();
        for(let line of lines){
            if(stopProgram) break;

            const check = checkBoundary(line);
            if(!check.ok){
                logLine(`&#9888;&#65039; Boundary hit on ${check.axis}: would reach ${check.newPos.toFixed(2)} (limit 0\u2013${check.max}). Recentering and stopping.`);
                await recenterAxis(check.axis);
                stopProgram = true;
                break;
            }

            await sendGcode(line);
            commitPosition(check.matches);
        }
    }

    logLine("Experiment stopped");
    playButton.disabled = false;
}

// ---------------- Save experiment ----------------
function driveConfigured(){
    return DRIVE_SCRIPT_URL && DRIVE_SCRIPT_URL !== "PASTE_YOUR_APPS_SCRIPT_URL_HERE";
}

async function syncExperimentToDrive(experiment){
    const response = await fetch(DRIVE_SCRIPT_URL, {
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify({
            action: "saveExperiment",
            secret: DRIVE_SECRET,
            experiment
        })
    });
    const result = await response.json();
    if(!result.success) throw new Error(result.error || "Drive save failed");
    return result.experiments;
}

// ---- thumbnail picker: from a recorded video frame, or an uploaded image ----
let chosenThumbnail = (loadedExperiment && loadedExperiment.thumbnail) || null;

const thumbnailPreview = document.getElementById("thumbnailPreview");
const thumbnailSourceBtn = document.getElementById("thumbnailSourceBtn");
const thumbnailSourceMenu = document.getElementById("thumbnailSourceMenu");
const chooseFromRecordingBtn = document.getElementById("chooseFromRecordingBtn");
const uploadImageBtn = document.getElementById("uploadImageBtn");
const thumbnailFileInput = document.getElementById("thumbnailFileInput");
const thumbnailModal = document.getElementById("thumbnailModal");
const thumbnailVideoList = document.getElementById("thumbnailVideoList");
const closeThumbnailModal = document.getElementById("closeThumbnailModal");

function renderThumbnailPreview(){
    if(thumbnailPreview){
        thumbnailPreview.innerHTML = chosenThumbnail
            ? `<img src="${chosenThumbnail}" alt="Chosen thumbnail">`
            : "No thumbnail";
    }
}
renderThumbnailPreview();

// downscale+compress anything (a <video> frame or an uploaded <img>) to a
// reasonably small JPEG data URL before storing it
function toThumbnailDataUrl(source, sourceWidth, sourceHeight){
    const targetWidth = 320;
    const scale = targetWidth / sourceWidth;
    const canvas = document.createElement("canvas");
    canvas.width = targetWidth;
    canvas.height = sourceHeight * scale;
    canvas.getContext("2d").drawImage(source, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/jpeg", 0.7);
}

// ---- dropdown open/close ----
if(thumbnailSourceBtn){
    thumbnailSourceBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        thumbnailSourceMenu.classList.toggle("open");
    });
    document.addEventListener("click", (e) => {
        if(!thumbnailSourceMenu.contains(e.target) && e.target !== thumbnailSourceBtn){
            thumbnailSourceMenu.classList.remove("open");
        }
    });
}

// ---- option 1: pick a frame from a recorded observation video ----
function openRecordingPicker(){
    const recordings = window.observationRecordings || [];
    if(recordings.length === 0){
        alert("No recorded videos yet — go record an observation first, then come back here.");
        return;
    }

    thumbnailVideoList.innerHTML = "";
    recordings.forEach(rec => {
        const item = document.createElement("div");
        item.className = "thumbnail-video-item";
        item.innerHTML = `
            <video src="${rec.url}" class="thumbnail-video" controls muted></video>
            <button type="button" class="fill-btn use-frame-btn">Use this frame</button>
        `;

        item.querySelector(".use-frame-btn").addEventListener("click", () => {
            const video = item.querySelector("video");
            if(!video.videoWidth){
                alert("This video is still loading — wait a moment and try again.");
                return;
            }
            chosenThumbnail = toThumbnailDataUrl(video, video.videoWidth, video.videoHeight);
            renderThumbnailPreview();
            thumbnailModal.classList.remove("open");
        });

        thumbnailVideoList.appendChild(item);
    });

    thumbnailModal.classList.add("open");
}

if(chooseFromRecordingBtn){
    chooseFromRecordingBtn.addEventListener("click", () => {
        thumbnailSourceMenu.classList.remove("open");
        openRecordingPicker();
    });
}

if(closeThumbnailModal){
    closeThumbnailModal.addEventListener("click", () => {
        thumbnailModal.classList.remove("open");
    });
}
if(thumbnailModal){
    thumbnailModal.addEventListener("click", (e) => {
        if(e.target === thumbnailModal) thumbnailModal.classList.remove("open");
    });
}

// ---- option 2: upload an image file from your device ----
function loadImageFromFile(file){
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
            const img = new Image();
            img.onload = () => resolve(img);
            img.onerror = () => reject(new Error("Couldn't read that image file"));
            img.src = reader.result;
        };
        reader.onerror = () => reject(new Error("Couldn't read that file"));
        reader.readAsDataURL(file);
    });
}

if(uploadImageBtn){
    uploadImageBtn.addEventListener("click", () => {
        thumbnailSourceMenu.classList.remove("open");
        thumbnailFileInput.click();
    });
}

if(thumbnailFileInput){
    thumbnailFileInput.addEventListener("change", async () => {
        const file = thumbnailFileInput.files[0];
        thumbnailFileInput.value = ""; // reset so picking the same file again still fires "change"
        if(!file) return;

        try{
            const img = await loadImageFromFile(file);
            chosenThumbnail = toThumbnailDataUrl(img, img.width, img.height);
            renderThumbnailPreview();
        }catch(err){
            alert("Couldn't use that image: " + err.message);
        }
    });
}

const saveExperimentBtn = document.getElementById("saveExperimentBtn");
const experimentNameInput = document.getElementById("experimentNameInput");
const saveExperimentNameText = document.getElementById("saveExperimentNameText");
const editExperimentNameBtn = document.getElementById("editExperimentNameBtn");
const saveExperimentStatus = document.getElementById("saveExperimentStatus");

let currentExperimentId = loadedExperiment ? loadedExperiment.id : null;

function showSavedState(name){
    experimentNameInput.style.display = "none";
    saveExperimentBtn.style.display = "none";
    saveExperimentNameText.textContent = name;
    editExperimentNameBtn.style.display = "inline-block";
}

function showUnsavedState(){
    experimentNameInput.style.display = "block";
    saveExperimentBtn.style.display = "inline-block";
    saveExperimentNameText.textContent = "Name your experiment";
    editExperimentNameBtn.style.display = "none";
}

function startRenaming(){
    const currentName = saveExperimentNameText.textContent;

    const input = document.createElement("input");
    input.type = "text";
    input.className = "rename-input";
    input.value = currentName;

    saveExperimentNameText.replaceWith(input);
    editExperimentNameBtn.style.display = "none";
    input.focus();
    input.select();

    function commitRename(){
        const newName = input.value.trim() || currentName;
        input.replaceWith(saveExperimentNameText);
        saveExperimentNameText.textContent = newName;
        editExperimentNameBtn.style.display = "inline-block";
        renameCurrentExperiment(newName);
    }

    function cancelRename(){
        input.replaceWith(saveExperimentNameText);
        editExperimentNameBtn.style.display = "inline-block";
    }

    input.addEventListener("blur", commitRename);
    input.addEventListener("keydown", (e) => {
        if(e.key === "Enter") input.blur();
        if(e.key === "Escape"){
            input.removeEventListener("blur", commitRename);
            cancelRename();
        }
    });
}

if(saveExperimentBtn && experimentNameInput){
    if(currentExperimentId){
        showSavedState(loadedExperiment.name);
    }else{
        showUnsavedState();
    }

    saveExperimentBtn.addEventListener("click", async () => {
        const name = experimentNameInput.value.trim();
        if(!name){
            alert("Give this experiment a name first.");
            return;
        }

        const experiment = {
            id: "exp_" + Date.now(),
            name,
            sliders: sliders.map(s => ({ ...s })),
            setup: document.getElementById("setupInput").value,
            motion: document.getElementById("motionInput").value,
            thumbnail: chosenThumbnail,
            savedAt: new Date().toISOString()
        };

        // always save locally first, so it isn't lost even if Drive fails
        const list = getSavedExperiments();
        list.push(experiment);
        setSavedExperiments(list);
        currentExperimentId = experiment.id;

        if(driveConfigured()){
            if(saveExperimentStatus) saveExperimentStatus.textContent = "Saving to Google Drive...";
            try{
                const driveList = await syncExperimentToDrive(experiment);
                setSavedExperiments(driveList); // Drive's copy is now the source of truth
                if(saveExperimentStatus) saveExperimentStatus.textContent = `Saved "${name}" to Google Drive — visible on any device now.`;
            }catch(err){
                if(saveExperimentStatus) saveExperimentStatus.textContent = `Saved locally, but Drive sync failed: ${err.message}`;
            }
        }else{
            if(saveExperimentStatus) saveExperimentStatus.textContent = `Saved "${name}" locally (this browser only). Set DRIVE_SCRIPT_URL in sketch.js to sync across devices.`;
        }

        showSavedState(name);
    });

    editExperimentNameBtn.addEventListener("click", startRenaming);
    saveExperimentNameText.addEventListener("dblclick", () => {
        if(currentExperimentId) startRenaming();
    });
}

async function renameCurrentExperiment(newName){
    if(!currentExperimentId) return;

    const list = getSavedExperiments();
    const entry = list.find(e => e.id === currentExperimentId);
    if(!entry) return;

    entry.name = newName;
    setSavedExperiments(list);

    if(saveExperimentStatus) saveExperimentStatus.textContent = "Renaming...";

    if(driveConfigured()){
        try{
            const driveList = await syncExperimentToDrive(entry);
            setSavedExperiments(driveList);
            if(saveExperimentStatus) saveExperimentStatus.textContent = `Renamed to "${newName}" and synced to Drive.`;
        }catch(err){
            if(saveExperimentStatus) saveExperimentStatus.textContent = `Renamed locally, but Drive sync failed: ${err.message}`;
        }
    }else{
        if(saveExperimentStatus) saveExperimentStatus.textContent = `Renamed to "${newName}" locally.`;
    }
}
