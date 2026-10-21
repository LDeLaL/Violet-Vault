/* =========================================================
   VIOLET VAULT
   Settings System — settings.js
   Compatible with save.js, script.js, effect.js and data.js
   ========================================================= */
(() => {
    "use strict";

    const DATA = window.VioletVaultData || {};
    const DEFAULT_SETTINGS = {
        theme: "dark",
        effectsEnabled: DATA.DEFAULT_EFFECTS_ENABLED !== false,
        animationsEnabled: DATA.DEFAULT_ANIMATIONS_ENABLED !== false
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
    let initialized = false;
    let lastFocusedElement = null;
    let saveStatusTimer = null;
    let keyboardEventsBound = false;
    let delegatedOpenEventsBound = false;

    const $ = (id) => document.getElementById(id);

    /* ---------------------------------------------------------
       1. Utilities
       --------------------------------------------------------- */

    function escapeHTML(value) {
        return String(value ?? "").replace(/[&<>"']/g, (character) => ({
            "&": "&amp;",
            "<": "&lt;",
            ">": "&gt;",
            '"': "&quot;",
            "'": "&#039;"
        })[character]);
    }

    function queryFirst(selectors, root = document) {
        for (const selector of selectors) {
            try {
                const element = root.querySelector(selector);
                if (element) return element;
            } catch (_) {
                // Skip an invalid selector without breaking settings.
            }
        }
        return null;
    }

    function queryAllUnique(selectors, root = document) {
        const found = new Set();

        for (const selector of selectors) {
            try {
                root.querySelectorAll(selector).forEach((element) => {
                    found.add(element);
                });
            } catch (_) {
                // Skip an invalid selector.
            }
        }

        return [...found];
    }

    function normalizeTheme(theme) {
        return String(theme || "").toLowerCase() === "light"
            ? "light"
            : "dark";
    }

    function normalizeBoolean(value, fallback) {
        if (typeof value === "boolean") return value;
        if (value === "true" || value === 1 || value === "1") return true;
        if (value === "false" || value === 0 || value === "0") return false;
        return fallback;
    }

    /* ---------------------------------------------------------
       2. Application state compatibility
       --------------------------------------------------------- */

    function getApp() {
        if (window.VioletVaultApp) {
            app = window.VioletVaultApp;
        }

        return app;
    }

    function getState() {
        const currentApp = getApp();

        const stores = [
            currentApp,
            window.SaveStore,
            window.VioletVaultSave
        ];

        for (const store of stores) {
            if (store && typeof store.getState === "function") {
                try {
                    const state = store.getState();

                    if (state && typeof state === "object") {
                        return state;
                    }
                } catch (error) {
                    console.warn(
                        "[VioletSettings] 상태 읽기 실패:",
                        error
                    );
                }
            }

            if (
                store?.state &&
                typeof store.state === "object"
            ) {
                return store.state;
            }
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

        const settings = state.settings;

        settings.theme = normalizeTheme(
            settings.theme ?? DEFAULT_SETTINGS.theme
        );

        settings.effectsEnabled = normalizeBoolean(
            settings.effectsEnabled,
            DEFAULT_SETTINGS.effectsEnabled
        );

        // Older saves may use "animations" instead of "animationsEnabled".
        const animationValue =
            settings.animationsEnabled ?? settings.animations;

        settings.animationsEnabled = normalizeBoolean(
            animationValue,
            DEFAULT_SETTINGS.animationsEnabled
        );

        settings.animations = settings.animationsEnabled;

        return settings;
    }

    function getSettings() {
        const state = getState();

        if (!state) {
            return { ...DEFAULT_SETTINGS };
        }

        return ensureSettingsObject(state) || {
            ...DEFAULT_SETTINGS
        };
    }

    function getSetting(name) {
        const settings = getSettings();

        if (
            !Object.prototype.hasOwnProperty.call(
                DEFAULT_SETTINGS,
                name
            )
        ) {
            return undefined;
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

        return normalizeBoolean(
            settings.animationsEnabled ?? settings.animations,
            DEFAULT_SETTINGS.animationsEnabled
        );
    }

    /* ---------------------------------------------------------
       3. Save settings
       --------------------------------------------------------- */

    function saveSettings() {
        const state = getState();

        if (!state) {
            return false;
        }

        try {
            if (
                window.SaveStore &&
                typeof window.SaveStore.save === "function"
            ) {
                return window.SaveStore.save(state) !== false;
            }

            if (
                window.VioletVaultSave &&
                typeof window.VioletVaultSave.save === "function"
            ) {
                return window.VioletVaultSave.save(state) !== false;
            }

            const currentApp = getApp();

            if (
                currentApp &&
                typeof currentApp.saveState === "function"
            ) {
                return currentApp.saveState() !== false;
            }

            if (
                currentApp &&
                typeof currentApp.save === "function"
            ) {
                return currentApp.save() !== false;
            }
        } catch (error) {
            console.error(
                "[VioletSettings] 설정 저장 실패:",
                error
            );
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
                    "[VioletSettings] 화면 갱신 실패:",
                    error
                );
            }
        }
    }

    /* ---------------------------------------------------------
       4. Apply settings to the page and companion modules
       --------------------------------------------------------- */

    function applyTheme(theme) {
        const value = normalizeTheme(theme);
        const root = document.documentElement;
        const body = document.body;

        root.dataset.theme = value;
        root.dataset.violetTheme = value;
        root.style.colorScheme = value;

        ["vv-theme-light", "violet-theme-light"].forEach((name) => {
            root.classList.toggle(name, value === "light");
            body?.classList.toggle(name, value === "light");
        });

        ["vv-theme-dark", "violet-theme-dark"].forEach((name) => {
            root.classList.toggle(name, value === "dark");
            body?.classList.toggle(name, value === "dark");
        });

        if (body) {
            body.dataset.theme = value;
            body.dataset.violetTheme = value;
        }

        document.dispatchEvent(
            new CustomEvent("violetvault:themechange", {
                detail: { theme: value }
            })
        );
    }

    function applyEffectsSetting(enabled) {
        const value = Boolean(enabled);

        document.documentElement.classList.toggle(
            "vv-effects-disabled",
            !value
        );

        document.body?.classList.toggle(
            "vv-effects-disabled",
            !value
        );

        const effects = window.VioletEffects || window.Effects;

        if (typeof effects?.setEnabled === "function") {
            try {
                effects.setEnabled(value);
            } catch (error) {
                console.warn(
                    "[VioletSettings] 효과 설정 적용 실패:",
                    error
                );
            }
        }

        document.dispatchEvent(
            new CustomEvent("violetvault:effectschange", {
                detail: { enabled: value }
            })
        );
    }

    function applyAnimationsSetting(enabled) {
        const value = Boolean(enabled);

        document.documentElement.classList.toggle(
            "vv-animations-disabled",
            !value
        );

        document.body?.classList.toggle(
            "vv-animations-disabled",
            !value
        );

        document.dispatchEvent(
            new CustomEvent("violetvault:animationschange", {
                detail: { enabled: value }
            })
        );
    }

    function applyAllSettings() {
        applyTheme(getSetting("theme"));
        applyEffectsSetting(getSetting("effectsEnabled"));
        applyAnimationsSetting(getSetting("animationsEnabled"));
    }

    function setSetting(name, value) {
        if (
            !Object.prototype.hasOwnProperty.call(
                DEFAULT_SETTINGS,
                name
            )
        ) {
            console.warn(
                `[VioletSettings] 알 수 없는 설정: ${name}`
            );

            return false;
        }

        const state = getState();
        const settings = ensureSettingsObject(state);

        if (!settings) {
            showSaveStatus(
                "게임 상태를 불러올 수 없어. 잠시 후 다시 시도해 줘.",
                true
            );

            return false;
        }

        const normalized = name === "theme"
            ? normalizeTheme(value)
            : normalizeBoolean(value, DEFAULT_SETTINGS[name]);

        settings[name] = normalized;

        // script.js와 구버전 저장 데이터가 모두 같은 값을 보도록 동기화한다.
        if (name === "animationsEnabled") {
            settings.animations = normalized;
        }

        if (name === "theme") {
            applyTheme(normalized);
        }

        if (name === "effectsEnabled") {
            applyEffectsSetting(normalized);
        }

        if (name === "animationsEnabled") {
            applyAnimationsSetting(normalized);
        }

        syncControls();

        const saved = saveSettings();

        showSaveStatus(
            saved
                ? "설정이 저장되었어."
                : "설정은 적용했지만 저장 여부를 확인하지 못했어.",
            !saved
        );

        document.dispatchEvent(
            new CustomEvent("violetvault:settingschange", {
                detail: {
                    name,
                    value: normalized
                }
            })
        );

        refreshApp();

        return true;
    }

    /* ---------------------------------------------------------
       5. Generated settings interface
       Preserves the original violet settings class names.
       --------------------------------------------------------- */

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

                        <h2 id="vv-settings-dialog-title">설정</h2>

                        <p>
                            나에게 맞는 플레이 환경을 설정하세요.
                        </p>
                    </div>

                    <button
                        type="button"
                        class="vv-settings-close"
                        data-settings-close
                        aria-label="설정 닫기">
                        ×
                    </button>

                </div>

                <div class="vv-settings-group">

                    <div class="vv-settings-group-heading">
                        <span class="vv-settings-group-icon">◐</span>

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
                            aria-pressed="true">

                            <span class="vv-settings-theme-preview vv-preview-dark">
                                <span></span><span></span><span></span>
                            </span>

                            <span class="vv-settings-theme-label">
                                다크 모드
                            </span>

                            <span class="vv-settings-theme-check">✓</span>
                        </button>

                        <button
                            type="button"
                            class="vv-settings-theme-option"
                            data-vv-theme-option="light"
                            aria-pressed="false">

                            <span class="vv-settings-theme-preview vv-preview-light">
                                <span></span><span></span><span></span>
                            </span>

                            <span class="vv-settings-theme-label">
                                라이트 모드
                            </span>

                            <span class="vv-settings-theme-check">✓</span>
                        </button>

                    </div>

                </div>

                <div class="vv-settings-group">

                    <div class="vv-settings-group-heading">
                        <span class="vv-settings-group-icon">✧</span>

                        <div>
                            <h3>시각 효과</h3>
                            <p>화면 효과와 애니메이션을 따로 조절할 수 있어.</p>
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
                                data-violet-setting="effects">

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
                                data-violet-setting="animations">

                            <span class="vv-settings-switch-track"></span>
                        </span>

                    </label>

                </div>

                <div class="vv-settings-status" aria-live="polite">

                    <span class="vv-settings-status-icon">✓</span>

                    <span
                        id="vv-settings-save-status"
                        class="vv-settings-status-text">
                        현재 설정이 적용되어 있어.
                    </span>

                </div>

                <div class="vv-settings-footer">
                    Violet Vault · Personal Settings
                </div>

            </div>`;
    }

    /* ---------------------------------------------------------
       6. Create a modal if needed
       --------------------------------------------------------- */

    function createModal() {
        modal = queryFirst(MODAL_SELECTORS);

        if (modal) {
            addGeneratedContentIfNeeded(modal);
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
                aria-labelledby="vv-settings-dialog-title">

                ${createSettingsContent()}

            </section>`;

        document.body.appendChild(modal);

        return modal;
    }

    function hasExistingSettingsControls(targetModal) {
        return Boolean(
            targetModal?.querySelector([
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
            ].join(","))
        );
    }

    function addGeneratedContentIfNeeded(targetModal) {
        if (!targetModal || hasExistingSettingsControls(targetModal)) {
            return;
        }

        if (targetModal.querySelector(".vv-settings-generated")) {
            return;
        }

        const destination = queryFirst([
            "[data-settings-content]",
            ".settings-content",
            ".settings-body",
            ".modal-body",
            ".settings-modal-content",
            ".modal-content"
        ], targetModal);

        const wrapper = document.createElement("div");
        wrapper.innerHTML = createSettingsContent();

        const content = wrapper.firstElementChild;

        if (destination) {
            destination.appendChild(content);
        } else {
            targetModal.appendChild(content);
        }
    }

    /* ---------------------------------------------------------
       7. Modal open / close and keyboard navigation
       --------------------------------------------------------- */

    function openModal() {
        if (!modal || !modal.isConnected) {
            createModal();
        }

        addGeneratedContentIfNeeded(modal);
        bindControls();

        lastFocusedElement = document.activeElement;

        modal.hidden = false;
        modal.setAttribute("aria-hidden", "false");

        modal.classList.add(
            "active",
            "show",
            "open",
            "is-open"
        );

        document.body?.classList.add("vv-settings-open");

        syncControls();
        applyAllSettings();

        requestAnimationFrame(() => {
            if (!modal || modal.hidden) return;

            const focusable = queryFirst([
                ".vv-settings-close",
                "[data-settings-close]",
                "#vv-setting-theme",
                "#vv-setting-effects",
                "button",
                "input",
                "select"
            ], modal);

            focusable?.focus({ preventScroll: true });
        });
    }

    function closeModal() {
        if (!modal) return;

        modal.classList.remove(
            "active",
            "show",
            "open",
            "is-open"
        );

        modal.setAttribute("aria-hidden", "true");
        modal.hidden = true;

        document.body?.classList.remove("vv-settings-open");

        if (
            lastFocusedElement?.isConnected &&
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

    function bindOpenButtons() {
        for (const button of queryAllUnique(OPEN_BUTTON_SELECTORS)) {
            if (
                button.dataset.violetSettingsOpenBound === "true"
            ) {
                continue;
            }

            button.dataset.violetSettingsOpenBound = "true";

            button.addEventListener("click", (event) => {
                event.preventDefault();
                openModal();
            });
        }

        if (delegatedOpenEventsBound) return;

        delegatedOpenEventsBound = true;

        document.addEventListener("click", (event) => {
            if (!(event.target instanceof Element)) return;

            let button;

            try {
                button = event.target.closest(
                    OPEN_BUTTON_SELECTORS.join(",")
                );
            } catch (_) {
                return;
            }

            if (!button || isModalOpen()) return;

            event.preventDefault();
            openModal();
        });
    }

    function bindCloseButtons() {
        if (!modal) return;

        for (const button of queryAllUnique(
            CLOSE_BUTTON_SELECTORS,
            modal
        )) {
            if (
                button.dataset.violetSettingsCloseBound === "true"
            ) {
                continue;
            }

            button.dataset.violetSettingsCloseBound = "true";

            button.addEventListener("click", (event) => {
                event.preventDefault();
                closeModal();
            });
        }

        if (
            modal.dataset.violetSettingsBackdropBound !== "true"
        ) {
            modal.dataset.violetSettingsBackdropBound = "true";

            modal.addEventListener("click", (event) => {
                if (event.target === modal) {
                    closeModal();
                }
            });
        }
    }

    function bindKeyboardEvents() {
        if (keyboardEventsBound) return;

        keyboardEventsBound = true;

        document.addEventListener("keydown", (event) => {
            if (!isModalOpen() || !modal) return;

            if (event.key === "Escape") {
                event.preventDefault();
                closeModal();
                return;
            }

            if (event.key !== "Tab") return;

            const focusable = Array.from(
                modal.querySelectorAll([
                    "button:not(:disabled)",
                    "a[href]",
                    "input:not(:disabled)",
                    "select:not(:disabled)",
                    "textarea:not(:disabled)",
                    "[tabindex]:not([tabindex='-1'])"
                ].join(","))
            ).filter((element) =>
                !element.hidden &&
                element.getAttribute("aria-hidden") !== "true" &&
                element.getClientRects().length > 0
            );

            if (!focusable.length) return;

            const first = focusable[0];
            const last = focusable[focusable.length - 1];

            if (
                event.shiftKey &&
                document.activeElement === first
            ) {
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

    /* ---------------------------------------------------------
       8. Controls
       --------------------------------------------------------- */

    function getControlName(element) {
        if (!element) return null;

        const raw = String(
            element.dataset.violetSetting ||
            element.dataset.setting ||
            ""
        ).toLowerCase();

        if (raw === "theme") return "theme";

        if (
            raw === "effects" ||
            raw === "effects-enabled"
        ) {
            return "effectsEnabled";
        }

        if (
            raw === "animations" ||
            raw === "animations-enabled"
        ) {
            return "animationsEnabled";
        }

        for (const name of Object.keys(CONTROL_SELECTORS)) {
            if (CONTROL_SELECTORS[name].some((selector) => {
                try {
                    return element.matches(selector);
                } catch (_) {
                    return false;
                }
            })) {
                return name;
            }
        }

        return null;
    }

    function readControlValue(element, name) {
        if (name === "theme") {
            if (
                element instanceof HTMLSelectElement ||
                element instanceof HTMLInputElement
            ) {
                return normalizeTheme(element.value);
            }

            const value =
                element.dataset.vvThemeOption ||
                element.dataset.theme ||
                element.dataset.value;

            if (value) return normalizeTheme(value);

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

    function bindControls() {
        if (!modal) return;

        bindCloseButtons();

        // Theme cards use a dedicated click handler.
        modal.querySelectorAll(
            "[data-vv-theme-option]"
        ).forEach((button) => {
            if (button.dataset.violetThemeBound === "true") {
                return;
            }

            button.dataset.violetThemeBound = "true";

            button.addEventListener("click", () => {
                setSetting(
                    "theme",
                    button.dataset.vvThemeOption
                );
            });
        });

        const controls = new Set();

        modal.querySelectorAll(
            "[data-violet-setting], [data-setting]"
        ).forEach((element) => controls.add(element));

        for (const name of Object.keys(CONTROL_SELECTORS)) {
            for (const element of queryAllUnique(
                CONTROL_SELECTORS[name],
                modal
            )) {
                controls.add(element);
            }
        }

        controls.forEach((control) => {
            if (control.matches("[data-vv-theme-option]")) return;

            if (
                control.dataset.violetSettingsControlBound === "true"
            ) {
                return;
            }

            const name = getControlName(control);

            if (!name) return;

            control.dataset.violetSettingsControlBound = "true";

            const eventType =
                control instanceof HTMLInputElement ||
                control instanceof HTMLSelectElement
                    ? "change"
                    : "click";

            control.addEventListener(eventType, (event) => {
                if (eventType === "click") {
                    event.preventDefault();
                }

                setSetting(
                    name,
                    readControlValue(control, name)
                );
            });
        });
    }

    function setControlValue(element, name) {
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
        for (const name of Object.keys(CONTROL_SELECTORS)) {
            for (const control of queryAllUnique(
                CONTROL_SELECTORS[name]
            )) {
                setControlValue(control, name);
            }
        }

        if (!modal) return;

        modal.querySelectorAll(
            "[data-vv-theme-option]"
        ).forEach((button) => {
            const selected =
                button.dataset.vvThemeOption === getSetting("theme");

            button.classList.toggle("selected", selected);
            button.classList.toggle("active", selected);

            button.setAttribute(
                "aria-pressed",
                String(selected)
            );
        });

        modal.querySelectorAll(
            "[data-violet-setting], [data-setting]"
        ).forEach((control) => {
            const name = getControlName(control);

            if (name) {
                setControlValue(control, name);
            }
        });
    }

    /* ---------------------------------------------------------
       9. Save status and lifecycle
       --------------------------------------------------------- */

    function showSaveStatus(message, isError = false) {
        if (!modal) return;

        const status = modal.querySelector(
            "#vv-settings-save-status, [data-settings-status]"
        );

        if (!status) return;

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
        }

        saveStatusTimer = null;

        if (!isError) {
            saveStatusTimer = setTimeout(() => {
                if (status.isConnected) {
                    status.textContent =
                        "현재 설정이 적용되어 있어.";
                }
            }, 2500);
        }
    }

    function initialize() {
        if (initialized || !document.body) return;

        initialized = true;
        app = window.VioletVaultApp || null;

        const state = getState();

        if (state) {
            ensureSettingsObject(state);
        }

        createModal();
        addGeneratedContentIfNeeded(modal);
        bindControls();
        bindOpenButtons();
        bindKeyboardEvents();
        applyAllSettings();
        syncControls();

        document.addEventListener(
            "violetvault:ready",
            () => {
                app = window.VioletVaultApp || app;

                const latest = getState();

                if (latest) {
                    ensureSettingsObject(latest);
                }

                applyAllSettings();
                syncControls();
            }
        );

        document.addEventListener(
            "game:data-changed",
            (event) => {
                const latest =
                    getState() || event?.detail?.state;

                if (latest) {
                    ensureSettingsObject(latest);
                }

                applyAllSettings();
                syncControls();
            }
        );

        console.log(
            "[Violet Vault] 설정 시스템 로드 완료."
        );
    }

    /* ---------------------------------------------------------
       10. Public API
       --------------------------------------------------------- */

    const VioletSettings = {
        init(application) {
            if (
                application &&
                typeof application === "object"
            ) {
                app = application;
            } else {
                app = window.VioletVaultApp || app;
            }

            if (!initialized) {
                initialize();
            } else {
                applyAllSettings();
                syncControls();
            }

            return VioletSettings;
        },

        open: openModal,

        close: closeModal,

        isOpen: isModalOpen,

        get: getSetting,

        set: setSetting,

        apply: applyAllSettings,

        save: saveSettings,

        sync() {
            syncControls();
            applyAllSettings();
        },

        getAll() {
            return { ...getSettings() };
        },

        reset() {
            const state = getState();
            const settings = ensureSettingsObject(state);

            if (!settings) return false;

            // 설정만 초기화하고 돈, 기록, 도감, 업적, 주식은 유지한다.
            settings.theme = DEFAULT_SETTINGS.theme;
            settings.effectsEnabled = DEFAULT_SETTINGS.effectsEnabled;

            settings.animationsEnabled =
                DEFAULT_SETTINGS.animationsEnabled;

            settings.animations =
                DEFAULT_SETTINGS.animationsEnabled;

            applyAllSettings();
            syncControls();

            const saved = saveSettings();

            showSaveStatus(
                saved
                    ? "설정이 기본값으로 복원되었어."
                    : "기본값을 적용했지만 저장 여부를 확인하지 못했어.",
                !saved
            );

            return saved;
        }
    };

    window.VioletSettings = VioletSettings;

    // Older script.js versions may use the Settings alias.
    window.Settings = Object.assign(
        window.Settings || {},
        VioletSettings
    );

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
