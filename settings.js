/* =========================================================
   Violet Vault - Settings System
   File: settings.js

   Features:
   - Dark / Light theme
   - Visual effects toggle
   - Animation toggle
   - Persistent settings
   - Keyboard accessibility
   - Modal open / close
   - Compatibility with VioletVaultApp
   - Compatibility with VioletVaultSave
   ========================================================= */

(function () {
    "use strict";

    /* -----------------------------------------------------
       1. Configuration
       ----------------------------------------------------- */

    const DEFAULT_SETTINGS = {
        theme: "dark",
        effectsEnabled: true,
        animationsEnabled: true
    };

    const OPEN_BUTTON_SELECTORS = [
        "#settings-button",
        "#open-settings",
        "#open-settings-button",
        "#settings-open-button",
        "[data-settings-open]",
        '[data-panel="settings"]',
        '[data-action="settings"]',
        ".settings-button",
        ".open-settings-button"
    ];

    const MODAL_SELECTORS = [
        "#settings-modal",
        "#settings-overlay",
        "#settings-dialog",
        "[data-settings-modal]"
    ];

    const CLOSE_BUTTON_SELECTORS = [
        "#close-settings",
        "#settings-close",
        "#close-settings-button",
        ".settings-close",
        ".close-settings",
        "[data-settings-close]"
    ];

    const CONTROL_SELECTORS = {
        theme: [
            "#vv-setting-theme",
            "#settings-theme",
            "#theme-select",
            "#theme-setting",
            "#theme-toggle",
            "[data-violet-setting='theme']",
            "[data-setting='theme']"
        ],

        effectsEnabled: [
            "#vv-setting-effects",
            "#settings-effects",
            "#settings-effects-toggle",
            "#effects-toggle",
            "#effects-enabled",
            "[data-violet-setting='effects']",
            "[data-setting='effects']"
        ],

        animationsEnabled: [
            "#vv-setting-animations",
            "#settings-animations",
            "#settings-animations-toggle",
            "#animations-toggle",
            "#animations-enabled",
            "[data-violet-setting='animations']",
            "[data-setting='animations']"
        ]
    };

    let app = null;
    let modal = null;
    let generatedModal = false;
    let initialized = false;
    let lastFocusedElement = null;
    let saveStatusTimer = null;


    /* -----------------------------------------------------
       2. Utility Functions
       ----------------------------------------------------- */

    function escapeHTML(value) {
        return String(value ?? "").replace(
            /[&<>"']/g,
            function (character) {
                const entities = {
                    "&": "&amp;",
                    "<": "&lt;",
                    ">": "&gt;",
                    '"': "&quot;",
                    "'": "&#39;"
                };

                return entities[character];
            }
        );
    }


    function queryFirst(selectors, root = document) {
        for (const selector of selectors) {
            try {
                const element = root.querySelector(selector);

                if (element) {
                    return element;
                }
            } catch (error) {
                // Ignore invalid selectors and continue searching.
            }
        }

        return null;
    }


    function queryAllUnique(selectors, root = document) {
        const found = new Set();

        selectors.forEach(function (selector) {
            try {
                root.querySelectorAll(selector).forEach(function (element) {
                    found.add(element);
                });
            } catch (error) {
                // Ignore invalid selectors.
            }
        });

        return Array.from(found);
    }


    function normalizeTheme(theme) {
        return String(theme || "").toLowerCase() === "light"
            ? "light"
            : "dark";
    }


    function normalizeBoolean(value, fallback) {
        if (typeof value === "boolean") {
            return value;
        }

        if (value === "true" || value === 1) {
            return true;
        }

        if (value === "false" || value === 0) {
            return false;
        }

        return fallback;
    }


    function getDocumentRoot() {
        return document.documentElement;
    }


    function getBody() {
        return document.body;
    }


    /* -----------------------------------------------------
       3. App State
       ----------------------------------------------------- */

    function getApp() {
        if (app) {
            return app;
        }

        if (window.VioletVaultApp) {
            app = window.VioletVaultApp;
        }

        return app;
    }


    function getState() {
        const currentApp = getApp();

        if (
            currentApp &&
            typeof currentApp.getState === "function"
        ) {
            try {
                const state = currentApp.getState();

                if (state && typeof state === "object") {
                    return state;
                }
            } catch (error) {
                console.warn(
                    "[VioletSettings] Unable to retrieve app state:",
                    error
                );
            }
        }

        if (
            currentApp &&
            currentApp.state &&
            typeof currentApp.state === "object"
        ) {
            return currentApp.state;
        }

        return null;
    }


    function ensureSettingsObject(state) {
        if (!state || typeof state !== "object") {
            return null;
        }

        if (
            !state.settings ||
            typeof state.settings !== "object"
        ) {
            state.settings = {};
        }

        if (
            !Object.prototype.hasOwnProperty.call(
                state.settings,
                "theme"
            )
        ) {
            state.settings.theme = DEFAULT_SETTINGS.theme;
        }

        if (
            !Object.prototype.hasOwnProperty.call(
                state.settings,
                "effectsEnabled"
            )
        ) {
            state.settings.effectsEnabled =
                DEFAULT_SETTINGS.effectsEnabled;
        }

        if (
            !Object.prototype.hasOwnProperty.call(
                state.settings,
                "animationsEnabled"
            )
        ) {
            state.settings.animationsEnabled =
                DEFAULT_SETTINGS.animationsEnabled;
        }

        state.settings.theme = normalizeTheme(
            state.settings.theme
        );

        state.settings.effectsEnabled = normalizeBoolean(
            state.settings.effectsEnabled,
            DEFAULT_SETTINGS.effectsEnabled
        );

        state.settings.animationsEnabled = normalizeBoolean(
            state.settings.animationsEnabled,
            DEFAULT_SETTINGS.animationsEnabled
        );

        return state.settings;
    }


    function getSettings() {
        const state = getState();

        if (!state) {
            return Object.assign({}, DEFAULT_SETTINGS);
        }

        return ensureSettingsObject(state);
    }


    function getSetting(name) {
        const settings = getSettings();

        if (!settings) {
            return DEFAULT_SETTINGS[name];
        }

        if (name === "theme") {
            return normalizeTheme(settings.theme);
        }

        if (name === "effectsEnabled") {
            return normalizeBoolean(
                settings.effectsEnabled,
                DEFAULT_SETTINGS.effectsEnabled
            );
        }

        if (name === "animationsEnabled") {
            return normalizeBoolean(
                settings.animationsEnabled,
                DEFAULT_SETTINGS.animationsEnabled
            );
        }

        return settings[name];
    }


    /* -----------------------------------------------------
       4. Save Settings
       ----------------------------------------------------- */

    function saveSettings() {
        const state = getState();

        if (!state) {
            return false;
        }

        const currentApp = getApp();

        try {
            if (
                currentApp &&
                typeof currentApp.save === "function"
            ) {
                currentApp.save();

                return true;
            }

            if (
                currentApp &&
                typeof currentApp.saveState === "function"
            ) {
                currentApp.saveState();

                return true;
            }

            if (
                window.VioletVaultSave &&
                typeof window.VioletVaultSave.save === "function"
            ) {
                return window.VioletVaultSave.save(state) !== false;
            }
        } catch (error) {
            console.error(
                "[VioletSettings] Failed to save settings:",
                error
            );

            return false;
        }

        return false;
    }


    function refreshApp() {
        const currentApp = getApp();

        if (
            currentApp &&
            typeof currentApp.render === "function"
        ) {
            try {
                currentApp.render();
            } catch (error) {
                console.warn(
                    "[VioletSettings] App refresh failed:",
                    error
                );
            }

            return;
        }

        if (
            currentApp &&
            typeof currentApp.renderAll === "function"
        ) {
            try {
                currentApp.renderAll();
            } catch (error) {
                console.warn(
                    "[VioletSettings] App refresh failed:",
                    error
                );
            }
        }
    }


    /* -----------------------------------------------------
       5. Theme Application
       ----------------------------------------------------- */

    function applyTheme(theme) {
        const normalizedTheme = normalizeTheme(theme);
        const root = getDocumentRoot();
        const body = getBody();

        root.dataset.violetTheme = normalizedTheme;
        root.dataset.theme = normalizedTheme;
        root.classList.toggle(
            "vv-theme-light",
            normalizedTheme === "light"
        );

        root.classList.toggle(
            "vv-theme-dark",
            normalizedTheme === "dark"
        );

        root.classList.toggle(
            "violet-theme-light",
            normalizedTheme === "light"
        );

        root.classList.toggle(
            "violet-theme-dark",
            normalizedTheme === "dark"
        );

        root.style.colorScheme = normalizedTheme;

        if (body) {
            body.dataset.violetTheme = normalizedTheme;
            body.dataset.theme = normalizedTheme;

            body.classList.toggle(
                "vv-theme-light",
                normalizedTheme === "light"
            );

            body.classList.toggle(
                "vv-theme-dark",
                normalizedTheme === "dark"
            );

            body.classList.toggle(
                "violet-theme-light",
                normalizedTheme === "light"
            );

            body.classList.toggle(
                "violet-theme-dark",
                normalizedTheme === "dark"
            );
        }

        document.dispatchEvent(
            new CustomEvent("violetvault:themechange", {
                detail: {
                    theme: normalizedTheme
                }
            })
        );
    }


    /* -----------------------------------------------------
       6. Effects and Animation Application
       ----------------------------------------------------- */

    function applyEffectsSetting(enabled) {
        const root = getDocumentRoot();
        const body = getBody();

        root.classList.toggle(
            "vv-effects-disabled",
            !enabled
        );

        if (body) {
            body.classList.toggle(
                "vv-effects-disabled",
                !enabled
            );
        }

        if (
            window.VioletEffects &&
            typeof window.VioletEffects.setEnabled === "function"
        ) {
            try {
                window.VioletEffects.setEnabled(enabled);
            } catch (error) {
                console.warn(
                    "[VioletSettings] Unable to update visual effects:",
                    error
                );
            }
        }

        document.dispatchEvent(
            new CustomEvent("violetvault:effectschange", {
                detail: {
                    enabled: Boolean(enabled)
                }
            })
        );
    }


    function applyAnimationsSetting(enabled) {
        const root = getDocumentRoot();
        const body = getBody();

        root.classList.toggle(
            "vv-animations-disabled",
            !enabled
        );

        if (body) {
            body.classList.toggle(
                "vv-animations-disabled",
                !enabled
            );
        }

        document.dispatchEvent(
            new CustomEvent("violetvault:animationschange", {
                detail: {
                    enabled: Boolean(enabled)
                }
            })
        );
    }


    function applyAllSettings() {
        applyTheme(getSetting("theme"));
        applyEffectsSetting(getSetting("effectsEnabled"));
        applyAnimationsSetting(
            getSetting("animationsEnabled")
        );
    }


    /* -----------------------------------------------------
       7. Update One Setting
       ----------------------------------------------------- */

    function setSetting(name, value) {
        if (
            !Object.prototype.hasOwnProperty.call(
                DEFAULT_SETTINGS,
                name
            )
        ) {
            console.warn(
                `[VioletSettings] Unknown setting: ${name}`
            );

            return false;
        }

        const state = getState();

        if (!state) {
            showSaveStatus(
                "게임 상태를 불러올 수 없습니다.",
                true
            );

            return false;
        }

        const settings = ensureSettingsObject(state);

        if (!settings) {
            return false;
        }

        let normalizedValue;

        if (name === "theme") {
            normalizedValue = normalizeTheme(value);
        } else {
            normalizedValue = normalizeBoolean(
                value,
                DEFAULT_SETTINGS[name]
            );
        }

        settings[name] = normalizedValue;

        if (name === "theme") {
            applyTheme(normalizedValue);
        }

        if (name === "effectsEnabled") {
            applyEffectsSetting(normalizedValue);
        }

        if (name === "animationsEnabled") {
            applyAnimationsSetting(normalizedValue);
        }

        syncControls();

        const saved = saveSettings();

        if (saved) {
            showSaveStatus("설정이 저장되었습니다.");
        } else {
            showSaveStatus(
                "설정은 적용했지만 저장 여부를 확인할 수 없습니다.",
                true
            );
        }

        document.dispatchEvent(
            new CustomEvent("violetvault:settingschange", {
                detail: {
                    name,
                    value: normalizedValue
                }
            })
        );

        return true;
    }


    /* -----------------------------------------------------
       8. Generated Settings Interface
       ----------------------------------------------------- */

    function createSettingsContent() {
        return `
            <div class="vv-settings-generated">

                <div class="vv-settings-heading">

                    <div class="vv-settings-heading-icon">
                        <span aria-hidden="true">⚙</span>
                    </div>

                    <div class="vv-settings-heading-text">
                        <span class="vv-settings-eyebrow">
                            VIOLET VAULT
                        </span>

                        <h2>설정</h2>

                        <p>
                            나에게 맞는 플레이 환경을 설정하세요.
                        </p>
                    </div>

                    <button
                        type="button"
                        class="vv-settings-close"
                        data-settings-close
                        aria-label="설정 닫기"
                    >
                        ×
                    </button>

                </div>


                <div class="vv-settings-group">

                    <div class="vv-settings-group-heading">
                        <span class="vv-settings-group-icon">
                            ◐
                        </span>

                        <div>
                            <h3>화면 테마</h3>
                            <p>원하는 화면 분위기를 선택하세요.</p>
                        </div>
                    </div>

                    <div class="vv-settings-theme-options">

                        <button
                            type="button"
                            class="vv-settings-theme-option"
                            data-vv-theme-option="dark"
                            aria-pressed="true"
                        >
                            <span class="vv-settings-theme-preview vv-preview-dark">
                                <span></span>
                                <span></span>
                                <span></span>
                            </span>

                            <span class="vv-settings-theme-label">
                                다크 모드
                            </span>

                            <span class="vv-settings-theme-check">
                                ✓
                            </span>
                        </button>

                        <button
                            type="button"
                            class="vv-settings-theme-option"
                            data-vv-theme-option="light"
                            aria-pressed="false"
                        >
                            <span class="vv-settings-theme-preview vv-preview-light">
                                <span></span>
                                <span></span>
                                <span></span>
                            </span>

                            <span class="vv-settings-theme-label">
                                라이트 모드
                            </span>

                            <span class="vv-settings-theme-check">
                                ✓
                            </span>
                        </button>

                    </div>

                </div>


                <div class="vv-settings-group">

                    <div class="vv-settings-group-heading">
                        <span class="vv-settings-group-icon">
                            ✧
                        </span>

                        <div>
                            <h3>시각 효과</h3>
                            <p>
                                화면 효과를 켜거나 끌 수 있습니다.
                            </p>
                        </div>
                    </div>

                    <label class="vv-settings-row">

                        <span class="vv-settings-row-info">
                            <strong>화려한 효과</strong>

                            <small>
                                당첨 효과와 시각적 연출을 사용합니다.
                            </small>
                        </span>

                        <span class="vv-settings-switch">
                            <input
                                type="checkbox"
                                id="vv-setting-effects"
                                data-violet-setting="effects"
                            >

                            <span class="vv-settings-switch-track"></span>
                        </span>

                    </label>

                    <label class="vv-settings-row">

                        <span class="vv-settings-row-info">
                            <strong>애니메이션</strong>

                            <small>
                                전환, 움직임, 애니메이션을 사용합니다.
                            </small>
                        </span>

                        <span class="vv-settings-switch">
                            <input
                                type="checkbox"
                                id="vv-setting-animations"
                                data-violet-setting="animations"
                            >

                            <span class="vv-settings-switch-track"></span>
                        </span>

                    </label>

                </div>


                <div class="vv-settings-status" aria-live="polite">

                    <span class="vv-settings-status-icon">
                        ✓
                    </span>

                    <span
                        id="vv-settings-save-status"
                        class="vv-settings-status-text"
                    >
                        현재 설정이 적용되어 있습니다.
                    </span>

                </div>


                <div class="vv-settings-footer">
                    Violet Vault · Personal Settings
                </div>

            </div>
        `;
    }


    /* -----------------------------------------------------
       9. Create a Modal if Needed
       ----------------------------------------------------- */

    function createModal() {
        const existing = queryFirst(MODAL_SELECTORS);

        if (existing) {
            modal = existing;
            generatedModal = false;

            return modal;
        }

        modal = document.createElement("div");

        modal.id = "settings-modal";
        modal.className = "vv-settings-overlay";
        modal.setAttribute("data-settings-modal", "");
        modal.setAttribute("aria-hidden", "true");
        modal.setAttribute("role", "presentation");
        modal.hidden = true;

        modal.innerHTML = `
            <section
                class="vv-settings-dialog"
                role="dialog"
                aria-modal="true"
                aria-labelledby="vv-settings-dialog-title"
            >
                ${createSettingsContent()}
            </section>
        `;

        const heading = modal.querySelector(
            ".vv-settings-heading-text h2"
        );

        if (heading) {
            heading.id = "vv-settings-dialog-title";
        }

        document.body.appendChild(modal);

        generatedModal = true;

        return modal;
    }


    function hasExistingSettingsControls(targetModal) {
        if (!targetModal) {
            return false;
        }

        return Boolean(
            targetModal.querySelector(
                [
                    "[data-violet-setting]",
                    "[data-setting='theme']",
                    "[data-setting='effects']",
                    "[data-setting='animations']",
                    "#settings-effects",
                    "#settings-animations",
                    "#settings-theme",
                    "#theme-select",
                    "#effects-toggle",
                    "#animations-toggle"
                ].join(",")
            )
        );
    }


    function addGeneratedContentIfNeeded(targetModal) {
        if (!targetModal) {
            return;
        }

        if (hasExistingSettingsControls(targetModal)) {
            return;
        }

        const existingGenerated = targetModal.querySelector(
            ".vv-settings-generated"
        );

        if (existingGenerated) {
            return;
        }

        const destination = queryFirst(
            [
                "[data-settings-content]",
                ".settings-content",
                ".settings-body",
                ".modal-body",
                ".settings-modal-content",
                ".modal-content"
            ],
            targetModal
        );

        if (destination) {
            const wrapper = document.createElement("div");

            wrapper.innerHTML = createSettingsContent();

            destination.appendChild(
                wrapper.firstElementChild
            );

            return;
        }

        const wrapper = document.createElement("div");

        wrapper.innerHTML = createSettingsContent();

        targetModal.appendChild(
            wrapper.firstElementChild
        );
    }


    /* -----------------------------------------------------
       10. Modal Open / Close
       ----------------------------------------------------- */

    function openModal() {
        if (!modal) {
            createModal();
            addGeneratedContentIfNeeded(modal);
            bindControls();
        }

        lastFocusedElement = document.activeElement;

        modal.hidden = false;
        modal.setAttribute("aria-hidden", "false");

        modal.classList.add(
            "active",
            "show",
            "open",
            "is-open"
        );

        if (getBody()) {
            getBody().classList.add("vv-settings-open");
        }

        syncControls();
        applyAllSettings();

        requestAnimationFrame(function () {
            if (!modal) {
                return;
            }

            const firstFocusable = queryFirst(
                [
                    ".vv-settings-close",
                    "[data-settings-close]",
                    "#vv-setting-theme",
                    "#settings-theme",
                    "#vv-setting-effects",
                    "button",
                    "input",
                    "select"
                ],
                modal
            );

            if (firstFocusable) {
                firstFocusable.focus({
                    preventScroll: true
                });
            }
        });
    }


    function closeModal() {
        if (!modal) {
            return;
        }

        modal.classList.remove(
            "active",
            "show",
            "open",
            "is-open"
        );

        modal.setAttribute("aria-hidden", "true");
        modal.hidden = true;

        if (getBody()) {
            getBody().classList.remove("vv-settings-open");
        }

        if (
            lastFocusedElement &&
            document.contains(lastFocusedElement) &&
            typeof lastFocusedElement.focus === "function"
        ) {
            lastFocusedElement.focus({
                preventScroll: true
            });
        }

        lastFocusedElement = null;
    }


    function isModalOpen() {
        return Boolean(
            modal &&
            !modal.hidden &&
            modal.getAttribute("aria-hidden") !== "true"
        );
    }


    /* -----------------------------------------------------
       11. Open and Close Buttons
       ----------------------------------------------------- */

    function bindOpenButtons() {
        const buttons = queryAllUnique(
            OPEN_BUTTON_SELECTORS
        );

        buttons.forEach(function (button) {
            if (button.dataset.violetSettingsOpenBound === "true") {
                return;
            }

            button.dataset.violetSettingsOpenBound = "true";

            button.addEventListener("click", function (event) {
                event.preventDefault();
                openModal();
            });
        });

        /*
         * Delegated handler supports buttons added dynamically
         * after initialization.
         */
        if (document.body.dataset.violetSettingsDelegated !== "true") {
            document.body.dataset.violetSettingsDelegated = "true";

            document.addEventListener("click", function (event) {
                const target = event.target;

                if (!(target instanceof Element)) {
                    return;
                }

                const openButton = target.closest(
                    OPEN_BUTTON_SELECTORS.join(",")
                );

                if (!openButton) {
                    return;
                }

                /*
                 * Avoid reopening a modal that is already visible.
                 * Explicitly opening an already open modal is harmless.
                 */
                if (isModalOpen()) {
                    return;
                }

                event.preventDefault();
                openModal();
            });
        }
    }


    function bindCloseButtons() {
        if (!modal) {
            return;
        }

        const buttons = queryAllUnique(
            CLOSE_BUTTON_SELECTORS,
            modal
        );

        buttons.forEach(function (button) {
            if (button.dataset.violetSettingsCloseBound === "true") {
                return;
            }

            button.dataset.violetSettingsCloseBound = "true";

            button.addEventListener("click", function (event) {
                event.preventDefault();
                closeModal();
            });
        });

        modal.addEventListener("click", function (event) {
            if (event.target === modal) {
                closeModal();
            }
        });
    }


    /* -----------------------------------------------------
       12. Control Discovery
       ----------------------------------------------------- */

    function getControls(name) {
        const selectors = CONTROL_SELECTORS[name] || [];

        return queryAllUnique(selectors);
    }


    function getControlName(element) {
        if (!element) {
            return null;
        }

        const value = String(
            element.dataset.violetSetting ||
            element.dataset.setting ||
            ""
        ).toLowerCase();

        if (
            value === "theme" ||
            value === "effects" ||
            value === "effects-enabled" ||
            value === "animations" ||
            value === "animations-enabled"
        ) {
            if (value === "effects" || value === "effects-enabled") {
                return "effectsEnabled";
            }

            if (value === "animations" || value === "animations-enabled") {
                return "animationsEnabled";
            }

            return "theme";
        }

        for (const name of Object.keys(CONTROL_SELECTORS)) {
            if (getControls(name).includes(element)) {
                return name;
            }
        }

        if (element.id === "vv-setting-effects") {
            return "effectsEnabled";
        }

        if (element.id === "vv-setting-animations") {
            return "animationsEnabled";
        }

        return null;
    }


    function getValueFromControl(element, name) {
        if (!element) {
            return undefined;
        }

        if (name === "theme") {
            if (
                element instanceof HTMLSelectElement ||
                element instanceof HTMLInputElement
            ) {
                return normalizeTheme(element.value);
            }

            const themeValue =
                element.dataset.theme ||
                element.dataset.value ||
                element.dataset.settingValue;

            if (themeValue) {
                return normalizeTheme(themeValue);
            }

            return getSetting("theme") === "dark"
                ? "light"
                : "dark";
        }

        if (
            element instanceof HTMLInputElement &&
            element.type === "checkbox"
        ) {
            return element.checked;
        }

        if (element.getAttribute("aria-pressed") === "true") {
            return false;
        }

        if (element.getAttribute("aria-pressed") === "false") {
            return true;
        }

        return !Boolean(getSetting(name));
    }


    /* -----------------------------------------------------
       13. Bind Existing Controls
       ----------------------------------------------------- */

    function bindControls() {
        if (!modal) {
            return;
        }

        bindCloseButtons();

        modal.querySelectorAll(
            "[data-violet-setting], [data-setting]"
        ).forEach(function (control) {
            if (control.dataset.violetSettingsControlBound === "true") {
                return;
            }

            control.dataset.violetSettingsControlBound = "true";

            const name = getControlName(control);

            if (!name) {
                return;
            }

            const eventType =
                control instanceof HTMLInputElement &&
                control.type === "checkbox"
                    ? "change"
                    : (
                        control instanceof HTMLSelectElement ||
                        control instanceof HTMLInputElement
                    )
                        ? "change"
                        : "click";

            control.addEventListener(eventType, function (event) {
                if (eventType === "click") {
                    event.preventDefault();
                }

                const value = getValueFromControl(
                    control,
                    name
                );

                setSetting(name, value);
            });
        });

        /*
         * Also supports recognized existing controls with IDs
         * but without data-setting attributes.
         */
        Object.keys(CONTROL_SELECTORS).forEach(function (name) {
            getControls(name).forEach(function (control) {
                if (
                    modal.contains(control) &&
                    control.dataset.violetSettingsControlBound === "true"
                ) {
                    return;
                }

                if (!modal.contains(control)) {
                    return;
                }

                control.dataset.violetSettingsControlBound = "true";

                const eventType =
                    control instanceof HTMLInputElement &&
                    control.type === "checkbox"
                        ? "change"
                        : (
                            control instanceof HTMLSelectElement ||
                            control instanceof HTMLInputElement
                        )
                            ? "change"
                            : "click";

                control.addEventListener(eventType, function (event) {
                    if (eventType === "click") {
                        event.preventDefault();
                    }

                    setSetting(
                        name,
                        getValueFromControl(control, name)
                    );
                });
            });
        });

        /*
         * Generated theme choices are separate buttons.
         */
        modal.querySelectorAll("[data-vv-theme-option]").forEach(
            function (button) {
                if (button.dataset.violetThemeBound === "true") {
                    return;
                }

                button.dataset.violetThemeBound = "true";

                button.addEventListener("click", function () {
                    setSetting(
                        "theme",
                        button.dataset.vvThemeOption
                    );
                });
            }
        );
    }


    /* -----------------------------------------------------
       14. Synchronize Controls
       ----------------------------------------------------- */

    function setControlValue(element, name) {
        if (!element) {
            return;
        }

        const value = getSetting(name);

        if (name === "theme") {
            if (
                element instanceof HTMLSelectElement ||
                element instanceof HTMLInputElement
            ) {
                element.value = value;
            }

            element.setAttribute(
                "aria-pressed",
                String(value === "light")
            );

            element.dataset.currentTheme = value;

            return;
        }

        if (
            element instanceof HTMLInputElement &&
            element.type === "checkbox"
        ) {
            element.checked = Boolean(value);
            return;
        }

        element.setAttribute(
            "aria-pressed",
            String(Boolean(value))
        );

        element.dataset.enabled = String(Boolean(value));

        const status = element.querySelector(
            ".settings-toggle-status, .toggle-status"
        );

        if (status) {
            status.textContent = value ? "켜짐" : "꺼짐";
        }
    }


    function syncControls() {
        Object.keys(CONTROL_SELECTORS).forEach(function (name) {
            getControls(name).forEach(function (control) {
                setControlValue(control, name);
            });
        });

        if (!modal) {
            return;
        }

        /*
         * Theme choice cards.
         */
        modal.querySelectorAll("[data-vv-theme-option]").forEach(
            function (button) {
                const selected =
                    button.dataset.vvThemeOption === getSetting("theme");

                button.classList.toggle("selected", selected);
                button.classList.toggle("active", selected);

                button.setAttribute(
                    "aria-pressed",
                    String(selected)
                );
            }
        );

        /*
         * Switch indicator text.
         */
        modal.querySelectorAll(
            "[data-violet-setting], [data-setting]"
        ).forEach(function (control) {
            const name = getControlName(control);

            if (!name) {
                return;
            }

            setControlValue(control, name);
        });
    }


    /* -----------------------------------------------------
       15. Save Status
       ----------------------------------------------------- */

    function showSaveStatus(message, isError = false) {
        if (!modal) {
            return;
        }

        const status = modal.querySelector(
            "#vv-settings-save-status, [data-settings-status]"
        );

        if (!status) {
            return;
        }

        status.textContent = String(message);

        status.classList.toggle(
            "is-error",
            Boolean(isError)
        );

        status.classList.toggle(
            "is-success",
            !isError
        );

        if (saveStatusTimer) {
            clearTimeout(saveStatusTimer);
            saveStatusTimer = null;
        }

        if (!isError) {
            saveStatusTimer = setTimeout(function () {
                if (!status.isConnected) {
                    return;
                }

                status.textContent =
                    "현재 설정이 적용되어 있습니다.";
            }, 2500);
        }
    }


    /* -----------------------------------------------------
       16. Keyboard Accessibility
       ----------------------------------------------------- */

    function bindKeyboardEvents() {
        document.addEventListener("keydown", function (event) {
            if (!isModalOpen()) {
                return;
            }

            if (event.key === "Escape") {
                event.preventDefault();
                closeModal();
                return;
            }

            if (event.key !== "Tab" || !modal) {
                return;
            }

            const focusable = Array.from(
                modal.querySelectorAll(
                    [
                        "button:not(:disabled)",
                        "a[href]",
                        "input:not(:disabled)",
                        "select:not(:disabled)",
                        "textarea:not(:disabled)",
                        "[tabindex]:not([tabindex='-1'])"
                    ].join(",")
                )
            ).filter(function (element) {
                return (
                    !element.hidden &&
                    element.getAttribute("aria-hidden") !== "true" &&
                    element.getClientRects().length > 0
                );
            });

            if (focusable.length === 0) {
                return;
            }

            const first = focusable[0];
            const last = focusable[focusable.length - 1];

            if (event.shiftKey && document.activeElement === first) {
                event.preventDefault();
                last.focus();
            } else if (
                !event.shiftKey &&
                document.activeElement === last
            ) {
                event.preventDefault();
                first.focus();
            }
        });
    }


    /* -----------------------------------------------------
       17. Effects Module Synchronization
       ----------------------------------------------------- */

    function syncEffectsModule() {
        if (!window.VioletEffects) {
            return;
        }

        const enabled = getSetting("effectsEnabled");

        if (
            typeof window.VioletEffects.setEnabled === "function"
        ) {
            try {
                window.VioletEffects.setEnabled(enabled);
            } catch (error) {
                console.warn(
                    "[VioletSettings] Effect module synchronization failed:",
                    error
                );
            }
        }
    }


    /* -----------------------------------------------------
       18. Initialization
       ----------------------------------------------------- */

    function initialize() {
        if (initialized) {
            return;
        }

        initialized = true;
        app = window.VioletVaultApp || null;

        const state = getState();

        if (state) {
            ensureSettingsObject(state);
        }

        createModal();
        addGeneratedContentIfNeeded(modal);

        /*
         * Bind the controls after the interface exists.
         */
        bindControls();
        bindOpenButtons();
        bindKeyboardEvents();

        applyAllSettings();
        syncControls();

        /*
         * Apply effects again after modules have loaded.
         */
        syncEffectsModule();

        /*
         * Another script may finish initializing the app later.
         * Retry state synchronization when the app announces readiness.
         */
        document.addEventListener(
            "violetvault:ready",
            function () {
                app = window.VioletVaultApp || app;

                const latestState = getState();

                if (latestState) {
                    ensureSettingsObject(latestState);
                }

                applyAllSettings();
                syncControls();
            }
        );
    }


    /* -----------------------------------------------------
       19. Public API
       ----------------------------------------------------- */

    window.VioletSettings = {
        init: function (application) {
            if (application && typeof application === "object") {
                app = application;
            } else if (window.VioletVaultApp) {
                app = window.VioletVaultApp;
            }

            if (!initialized) {
                initialize();
            } else {
                applyAllSettings();
                syncControls();
            }

            return this;
        },

        open: openModal,

        close: closeModal,

        isOpen: isModalOpen,

        get: getSetting,

        set: setSetting,

        getAll: function () {
            const settings = getSettings();

            return Object.assign(
                {},
                settings || DEFAULT_SETTINGS
            );
        },

        apply: applyAllSettings,

        save: saveSettings,

        sync: function () {
            syncControls();
            applyAllSettings();
        },

        reset: function () {
            /*
             * Reset settings only.
             * This does not reset balance, history,
             * achievements, stock holdings, or debt.
             */
            const state = getState();

            if (!state) {
                return false;
            }

            const settings = ensureSettingsObject(state);

            settings.theme = DEFAULT_SETTINGS.theme;
            settings.effectsEnabled =
                DEFAULT_SETTINGS.effectsEnabled;

            settings.animationsEnabled =
                DEFAULT_SETTINGS.animationsEnabled;

            applyAllSettings();
            syncControls();

            saveSettings();

            showSaveStatus("설정이 기본값으로 복원되었습니다.");

            return true;
        }
    };


    /* -----------------------------------------------------
       20. Start
       ----------------------------------------------------- */

    if (document.readyState === "loading") {
        document.addEventListener(
            "DOMContentLoaded",
            initialize,
            { once: true }
        );
    } else {
        initialize();
    }

})();
