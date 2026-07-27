const THEME_PRESETS = [
    { name: "Classic", header: "#000000", accent: "#7cd0fc" },
    { name: "Sunny",   header: "#ffd452", accent: "#7cd0fc" },
    { name: "Blossom", header: "#f9a8c9", accent: "#b3b0e6" },
];
const THEME_KEY = "physicsPlaygroundTheme";

function applyTheme(theme){
    document.documentElement.style.setProperty("--header-color", theme.header);
    document.documentElement.style.setProperty("--accent-color", theme.accent);
}

function saveTheme(theme){
    localStorage.setItem(THEME_KEY, JSON.stringify(theme));
}

function getSavedTheme(){
    try{
        return JSON.parse(localStorage.getItem(THEME_KEY));
    }catch(e){
        return null;
    }
}

// apply immediately (in case the anti-flicker <head> script wasn't added
// to this particular page)
const savedThemeOnLoad = getSavedTheme();
if(savedThemeOnLoad) applyTheme(savedThemeOnLoad);

function buildSettingsUI(){
    const nav = document.querySelector(".topnav");
    if(!nav) return;

    const wrap = document.createElement("div");
    wrap.className = "settings-dropdown";
    wrap.innerHTML = `
        <button type="button" class="nav-pill settings-btn" title="Color theme">&#9881;&#65039;</button>
        <div class="settings-menu">
            <div class="settings-menu-label">Color theme</div>
            <div class="theme-swatch-row"></div>
        </div>
    `;
    nav.appendChild(wrap);

    const row = wrap.querySelector(".theme-swatch-row");
    THEME_PRESETS.forEach(theme => {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "theme-swatch";
        btn.title = theme.name;
        btn.innerHTML = `
            <span class="swatch-half" style="background:${theme.header}"></span>
            <span class="swatch-half" style="background:${theme.accent}"></span>
        `;
        btn.addEventListener("click", () => {
            applyTheme(theme);
            saveTheme(theme);
            wrap.querySelector(".settings-menu").classList.remove("open");
        });
        row.appendChild(btn);
    });

    wrap.querySelector(".settings-btn").addEventListener("click", (e) => {
        e.stopPropagation();
        wrap.querySelector(".settings-menu").classList.toggle("open");
    });
    document.addEventListener("click", (e) => {
        if(!wrap.contains(e.target)) wrap.querySelector(".settings-menu").classList.remove("open");
    });
}

buildSettingsUI();
