/* =========================================================
   VIOLET VAULT
   Visual Effects System — effect.js
   Compatible with index.html, data.js, script.js and settings.js
   ========================================================= */
(() => {
    "use strict";

    const DATA = window.VioletVaultData || {};
    const CONFIG = DATA.EFFECT_CONFIG || {};

    const SPECIAL_MIN = Number.isFinite(
        Number(CONFIG.SPECIAL_EFFECT_MIN_AMOUNT)
    )
        ? Number(CONFIG.SPECIAL_EFFECT_MIN_AMOUNT)
        : 66;

    const ULTIMATE_AMOUNT = Number.isFinite(
        Number(CONFIG.ULTIMATE_EFFECT_AMOUNT)
    )
        ? Number(CONFIG.ULTIMATE_EFFECT_AMOUNT)
        : 100;

    const BACKGROUND_ENABLED =
        CONFIG.BACKGROUND_PARTICLES_ENABLED !== false;

    const BUTTON_EFFECTS_ENABLED =
        CONFIG.BUTTON_EFFECTS_ENABLED !== false;

    const SCREEN_SHAKE_ENABLED =
        CONFIG.SCREEN_SHAKE_ENABLED !== false;

    const REDUCED_MOTION = window.matchMedia
        ? window.matchMedia("(prefers-reduced-motion: reduce)")
        : null;

    let effectsEnabled = readSavedEffectSetting();
    let initialized = false;
    let buttonEventsBound = false;
    let effectLayer = null;
    let backgroundLayer = null;

    const activeEffects = new Set();
    const backgroundParticles = new Set();

    const $ = (id) => document.getElementById(id);

    const random = (min, max) =>
        Math.random() * (max - min) + min;

    const randomInt = (min, max) =>
        Math.floor(random(min, max + 1));

    const clamp = (value, min, max) =>
        Math.min(max, Math.max(min, value));

    const reducedMotion = () =>
        Boolean(REDUCED_MOTION?.matches);

    /* =====================================================
       1. Load saved effect setting
       ===================================================== */

    function readSavedEffectSetting() {
        try {
            const state =
                window.SaveStore?.getState?.() ||
                window.VioletVaultSave?.getState?.() ||
                window.VioletVaultApp?.getState?.();

            if (
                typeof state?.settings?.effectsEnabled === "boolean"
            ) {
                return state.settings.effectsEnabled;
            }
        } catch (_) {
            // Use the saved JSON setting as a fallback.
        }

        try {
            const raw = localStorage.getItem(
                "violet-vault-save-v1"
            );

            if (raw) {
                const saved = JSON.parse(raw);

                if (
                    typeof saved?.settings?.effectsEnabled ===
                    "boolean"
                ) {
                    return saved.settings.effectsEnabled;
                }
            }
        } catch (_) {
            // Default effects remain enabled when storage is unavailable.
        }

        return CONFIG.BACKGROUND_PARTICLES_ENABLED !== false;
    }

    /* =====================================================
       2. Effect layer management
       ===================================================== */

    function addEffectElement(element) {
        ensureEffectLayer().appendChild(element);
        activeEffects.add(element);
        return element;
    }

    function ensureEffectLayer() {
        if (effectLayer?.isConnected) {
            return effectLayer;
        }

        effectLayer = $("violet-effect-layer");

        if (!effectLayer) {
            effectLayer = document.createElement("div");
            effectLayer.id = "violet-effect-layer";
            document.body.appendChild(effectLayer);
        }

        Object.assign(effectLayer.style, {
            position: "fixed",
            inset: "0",
            width: "100%",
            height: "100%",
            overflow: "hidden",
            pointerEvents: "none",
            zIndex: "900",
            contain: "layout style paint"
        });

        effectLayer.setAttribute("aria-hidden", "true");

        return effectLayer;
    }

    function removeEffectElement(element) {
        if (!element) return;

        if (element._violetAnimation) {
            try {
                element._violetAnimation.cancel();
            } catch (_) {}

            element._violetAnimation = null;
        }

        activeEffects.delete(element);
        element.remove();
    }

    function animate(element, keyframes, options = {}, onFinish) {
        if (
            !element ||
            typeof element.animate !== "function" ||
            reducedMotion()
        ) {
            if (onFinish) onFinish();
            return null;
        }

        const animation = element.animate(keyframes, {
            duration: options.duration ?? 700,
            easing: options.easing || "ease-out",
            fill: options.fill || "forwards",
            iterations: options.iterations || 1
        });

        element._violetAnimation = animation;

        if (onFinish) {
            animation.onfinish = onFinish;
        }

        return animation;
    }

    /* =====================================================
       3. Color helpers
       ===================================================== */

    function colorForAmount(amount) {
        const rarity =
            window.VioletRarity?.getRarityInfo?.(amount);

        if (rarity?.color) return rarity.color;

        if (amount >= ULTIMATE_AMOUNT) return "#f1d5ff";
        if (amount >= 86) return "#ff80d0";
        if (amount >= SPECIAL_MIN) return "#ffcf70";
        if (amount >= 46) return "#bd83ff";
        if (amount >= 26) return "#62a9ff";

        return "#c084fc";
    }

    function randomPurple() {
        const colors = [
            "#a855f7",
            "#c084fc",
            "#d8b4fe",
            "#e9d5ff",
            "#9333ea",
            "#7e22ce"
        ];

        return colors[
            randomInt(0, colors.length - 1)
        ];
    }

    function getEffectOrigin() {
        const target =
            $("result-number") ||
            $("draw-card") ||
            document.querySelector(".result-stage") ||
            $("money-display") ||
            $("draw-machine");

        if (!target) {
            return {
                x: window.innerWidth / 2,
                y: window.innerHeight / 2
            };
        }

        const rect = target.getBoundingClientRect();

        return {
            x: rect.left + rect.width / 2,
            y: rect.top + rect.height / 2
        };
    }

    /* =====================================================
       4. Toast notifications
       Supports toast(message, type)
       and toast(title, message).
       ===================================================== */

    function toast(first = "Violet Vault", second = "") {
        const statuses = new Set([
            "success",
            "error",
            "warning",
            "info"
        ]);

        const title = String(first ?? "Violet Vault");
        let message = "";
        let type = "info";

        if (statuses.has(String(second).toLowerCase())) {
            type = String(second).toLowerCase();
        } else if (second) {
            message = String(second);
        }

        let stack = $("toast-stack");

        if (!stack) {
            stack = document.createElement("div");
            stack.id = "toast-stack";
            document.body.appendChild(stack);
        }

        Object.assign(stack.style, {
            position: "fixed",
            right: "20px",
            bottom: "20px",
            zIndex: "1200",
            display: "grid",
            gap: "10px",
            width: "min(360px, calc(100vw - 32px))",
            pointerEvents: "none"
        });

        const item = document.createElement("div");

        item.className = `vv-toast vv-toast-${type}`;

        Object.assign(item.style, {
            padding: "12px 15px",
            border: "1px solid rgba(192,132,252,.38)",
            borderRadius: "12px",
            background: "rgba(22,13,35,.96)",
            color: "#f5efff",
            boxShadow: "0 8px 28px rgba(0,0,0,.26)",
            fontSize: "12px",
            lineHeight: "1.55",
            opacity: "0",
            transform: "translateY(8px)",
            transition: "opacity .2s ease, transform .2s ease"
        });

        const heading = document.createElement("strong");

        heading.textContent = title;
        heading.style.display = "block";

        heading.style.color =
            type === "error"
                ? "#ff9da8"
                : type === "success"
                    ? "#8ee7b0"
                    : "#c084fc";

        item.appendChild(heading);

        if (message) {
            const body = document.createElement("div");
            body.textContent = message;
            item.appendChild(body);
        }

        stack.appendChild(item);

        requestAnimationFrame(() => {
            item.style.opacity = "1";
            item.style.transform = "translateY(0)";
        });

        window.setTimeout(() => {
            item.style.opacity = "0";
            item.style.transform = "translateY(8px)";

            window.setTimeout(() => item.remove(), 220);
        }, 3300);
    }

    /* =====================================================
       5. Background particles
       Supports #particle-layer and #particle-background.
       ===================================================== */

    function ensureBackgroundLayer() {
        backgroundLayer =
            $("particle-layer") ||
            $("particle-background");

        if (!backgroundLayer) {
            backgroundLayer = document.createElement("div");
            backgroundLayer.id = "particle-background";
            document.body.prepend(backgroundLayer);
        }

        Object.assign(backgroundLayer.style, {
            position: "fixed",
            inset: "0",
            overflow: "hidden",
            pointerEvents: "none",
            zIndex: "0"
        });

        return backgroundLayer;
    }

    function clearBackgroundParticles() {
        for (const particle of backgroundParticles) {
            try {
                particle._violetAnimation?.cancel();
            } catch (_) {}

            particle.remove();
        }

        backgroundParticles.clear();
    }

    function createBackgroundParticle() {
        if (!backgroundLayer) return null;

        const particle = document.createElement("span");

        particle.className = "vv-background-particle";

        const size = random(2, 5);
        const duration = random(9000, 19000);
        const color = randomPurple();

        Object.assign(particle.style, {
            position: "absolute",
            left: `${random(0, 100)}%`,
            top: `${random(0, 100)}%`,
            width: `${size}px`,
            height: `${size}px`,
            borderRadius: "50%",
            background: color,
            boxShadow: `0 0 ${size * 4}px ${color}`,
            opacity: "0",
            pointerEvents: "none",
            willChange: "transform, opacity"
        });

        backgroundLayer.appendChild(particle);
        backgroundParticles.add(particle);

        const dx = random(-65, 65);
        const dy = random(-100, 100);

        const animation = animate(
            particle,
            [
                {
                    transform: "translate3d(0,0,0) scale(.6)",
                    opacity: 0
                },
                {
                    transform: "translate3d(0,-10px,0) scale(1)",
                    opacity: .6,
                    offset: .25
                },
                {
                    transform:
                        `translate3d(${dx}px,${dy}px,0) scale(.4)`,
                    opacity: 0
                }
            ],
            {
                duration,
                easing: "ease-in-out",
                iterations: Infinity
            }
        );

        particle._violetAnimation = animation;

        return particle;
    }

    function updateBackgroundVisibility() {
        if (!backgroundLayer) return;

        const show =
            effectsEnabled &&
            BACKGROUND_ENABLED &&
            !reducedMotion();

        backgroundLayer.style.visibility =
            show ? "visible" : "hidden";

        if (!show) {
            clearBackgroundParticles();
            return;
        }

        if (!backgroundParticles.size) {
            const count = window.innerWidth <= 760 ? 14 : 32;

            for (let i = 0; i < count; i++) {
                createBackgroundParticle();
            }
        }
    }

    function initializeBackground() {
        ensureBackgroundLayer();
        updateBackgroundVisibility();

        const layout = document.querySelector(
            ".workspace, .app-layout"
        );

        if (layout) {
            layout.style.position =
                layout.style.position || "relative";

            layout.style.zIndex =
                layout.style.zIndex || "1";
        }

        const footer = document.querySelector(
            ".site-footer, footer"
        );

        if (footer) {
            footer.style.position =
                footer.style.position || "relative";

            footer.style.zIndex =
                footer.style.zIndex || "1";
        }
    }

    /* =====================================================
       6. Button click particles
       ===================================================== */

    function createClickParticle(x, y, color) {
        const particle = document.createElement("span");
        const size = random(3, 6);

        Object.assign(particle.style, {
            position: "absolute",
            left: `${x - size / 2}px`,
            top: `${y - size / 2}px`,
            width: `${size}px`,
            height: `${size}px`,
            borderRadius: "50%",
            background: color,
            boxShadow: `0 0 10px ${color}`,
            pointerEvents: "none"
        });

        addEffectElement(particle);

        animate(
            particle,
            [
                {
                    transform: "translate(0,0) scale(1)",
                    opacity: .9
                },
                {
                    transform:
                        `translate(${random(-28, 28)}px,` +
                        `${random(-35, 15)}px) scale(0)`,
                    opacity: 0
                }
            ],
            { duration: random(300, 550) },
            () => removeEffectElement(particle)
        );
    }

    function playButtonEffect(button) {
        if (
            !effectsEnabled ||
            !BUTTON_EFFECTS_ENABLED ||
            !button ||
            button.disabled ||
            reducedMotion()
        ) {
            return;
        }

        const rect = button.getBoundingClientRect();

        for (let i = 0; i < 5; i++) {
            createClickParticle(
                random(rect.left, rect.right),
                random(rect.top, rect.bottom),
                randomPurple()
            );
        }
    }

    function bindButtonEffects() {
        if (buttonEventsBound) return;

        buttonEventsBound = true;

        document.addEventListener("click", event => {
            if (!(event.target instanceof Element)) return;

            const button = event.target.closest(
                "button.primary-button, " +
                "button.secondary-button, " +
                "button.icon-button, " +
                "button.menu-button, " +
                "button.text-button, " +
                "button, [role='button']"
            );

            if (button) {
                playButtonEffect(button);
            }
        });
    }

    /* =====================================================
       7. Screen flash
       ===================================================== */

    function playScreenFlash(color, opacity = .16) {
        if (!effectsEnabled || reducedMotion()) return;

        const flash = document.createElement("div");

        Object.assign(flash.style, {
            position: "absolute",
            inset: "0",
            background: color,
            opacity: String(clamp(opacity, 0, .3)),
            pointerEvents: "none",
            mixBlendMode: "screen"
        });

        addEffectElement(flash);

        animate(
            flash,
            [
                { opacity: clamp(opacity, 0, .3) },
                { opacity: 0 }
            ],
            { duration: 500 },
            () => removeEffectElement(flash)
        );
    }

    /* =====================================================
       8. Particle burst
       ===================================================== */

    function createBurstParticle(origin, color, options = {}) {
        const particle = document.createElement("span");

        const size = random(
            options.minSize ?? 3,
            options.maxSize ?? 8
        );

        const shape = randomInt(0, 2);

        Object.assign(particle.style, {
            position: "absolute",
            left: `${origin.x - size / 2}px`,
            top: `${origin.y - size / 2}px`,
            width: `${size}px`,
            height: `${size}px`,
            background: color,
            borderRadius: shape === 0 ? "50%" : "2px",
            boxShadow: `0 0 ${size * 3}px ${color}`,
            pointerEvents: "none",
            willChange: "transform, opacity"
        });

        if (shape === 2) {
            particle.style.clipPath =
                "polygon(50% 0%, 100% 100%, 0% 100%)";
        }

        addEffectElement(particle);

        const angle = random(0, Math.PI * 2);

        const distance = random(
            options.minDistance ?? 45,
            options.maxDistance ?? 145
        );

        const dx = Math.cos(angle) * distance;
        const dy = Math.sin(angle) * distance;
        const rotation = randomInt(-360, 360);

        animate(
            particle,
            [
                {
                    transform:
                        "translate(0,0) scale(.35) rotate(0deg)",
                    opacity: 1
                },
                {
                    transform:
                        `translate(${dx}px,${dy}px) ` +
                        `scale(1) rotate(${rotation}deg)`,
                    opacity: .9,
                    offset: .25
                },
                {
                    transform:
                        `translate(${dx * 1.2}px,${dy * 1.2}px) ` +
                        `scale(0) rotate(${rotation * 1.4}deg)`,
                    opacity: 0
                }
            ],
            {
                duration: random(
                    options.minDuration ?? 500,
                    options.maxDuration ?? 1000
                ),
                easing: "cubic-bezier(.15,.65,.3,1)"
            },
            () => removeEffectElement(particle)
        );
    }

    function playParticles(options = {}) {
        if (!effectsEnabled || reducedMotion()) {
            return false;
        }

        const origin = options.origin || getEffectOrigin();

        const count = clamp(
            Math.floor(Number(options.count) || 20),
            1,
            120
        );

        const color = options.color || "#c084fc";

        for (let i = 0; i < count; i++) {
            createBurstParticle(
                origin,
                Math.random() < .28
                    ? randomPurple()
                    : color,
                options
            );
        }

        return true;
    }

    /* =====================================================
       9. Glow rings
       ===================================================== */

    function createGlowRing(origin, color, size = 90) {
        if (!effectsEnabled || reducedMotion()) return;

        const ring = document.createElement("div");

        Object.assign(ring.style, {
            position: "absolute",
            left: `${origin.x}px`,
            top: `${origin.y}px`,
            width: `${size}px`,
            height: `${size}px`,
            border: `2px solid ${color}`,
            borderRadius: "50%",
            boxShadow:
                `0 0 20px ${color}, inset 0 0 12px ${color}`,
            transform: "translate(-50%,-50%) scale(.2)",
            opacity: ".95"
        });

        addEffectElement(ring);

        animate(
            ring,
            [
                {
                    transform:
                        "translate(-50%,-50%) scale(.2)",
                    opacity: .95
                },
                {
                    transform:
                        "translate(-50%,-50%) scale(2.8)",
                    opacity: 0
                }
            ],
            { duration: 750 },
            () => removeEffectElement(ring)
        );
    }

    /* =====================================================
       10. Draw machine highlight and shake
       ===================================================== */

    function highlightDrawMachine(color) {
        const machine = $("draw-card") || $("draw-machine");

        if (!machine || !effectsEnabled) return;

        machine.style.transition =
            "border-color 150ms ease, box-shadow 150ms ease";

        machine.style.borderColor = color;

        machine.style.boxShadow =
            `inset 0 0 42px ${color}22, 0 0 28px ${color}35`;

        window.setTimeout(() => {
            if (!machine.isConnected) return;

            machine.style.borderColor = "";
            machine.style.boxShadow = "";
        }, 850);
    }

    function shakeDrawMachine() {
        if (
            !effectsEnabled ||
            !SCREEN_SHAKE_ENABLED ||
            reducedMotion()
        ) {
            return;
        }

        const machine = $("draw-card") || $("draw-machine");

        if (!machine || typeof machine.animate !== "function") {
            return;
        }

        machine.animate(
            [
                { transform: "translateX(0)" },
                { transform: "translateX(-3px)" },
                { transform: "translateX(3px)" },
                { transform: "translateX(-2px)" },
                { transform: "translateX(2px)" },
                { transform: "translateX(0)" }
            ],
            {
                duration: 270,
                easing: "ease-out"
            }
        );
    }

    /* =====================================================
       11. Ultimate reward effect
       ===================================================== */

    function playUltimateEffect() {
        if (!effectsEnabled) return false;

        const origin = getEffectOrigin();

        playScreenFlash(
            "#a855f7",
            reducedMotion() ? .08 : .22
        );

        if (!reducedMotion()) {
            createGlowRing(origin, "#d8b4fe", 80);

            window.setTimeout(() => {
                createGlowRing(origin, "#a855f7", 100);
            }, 100);

            window.setTimeout(() => {
                createGlowRing(origin, "#f1d5ff", 130);
            }, 220);

            playParticles({
                origin,
                count: 75,
                color: "#d8b4fe",
                minDistance: 60,
                maxDistance: 240,
                minDuration: 650,
                maxDuration: 1450,
                minSize: 3,
                maxSize: 10
            });

            highlightDrawMachine("#d8b4fe");
            shakeDrawMachine();
        }

        return true;
    }

    /* =====================================================
       12. Win effects
       Accepts playWin(75) or playWin({ amount: 75 }).
       ===================================================== */

    function playWin(options = {}) {
        if (!effectsEnabled) return false;

        const amount = Number(
            typeof options === "number"
                ? options
                : options?.amount ?? options?.prize
        );

        if (!Number.isFinite(amount) || amount < 1) {
            return false;
        }

        const color = colorForAmount(amount);
        const origin = getEffectOrigin();

        if (amount >= ULTIMATE_AMOUNT) {
            return playUltimateEffect();
        }

        if (amount >= 86) {
            playScreenFlash(color, .13);
            createGlowRing(origin, color, 85);

            playParticles({
                origin,
                count: 36,
                color,
                minDistance: 50,
                maxDistance: 175,
                minDuration: 550,
                maxDuration: 1150,
                minSize: 3,
                maxSize: 8
            });

            highlightDrawMachine(color);
            shakeDrawMachine();

            return true;
        }

        if (amount >= SPECIAL_MIN) {
            createGlowRing(origin, color, 70);

            playParticles({
                origin,
                count: 23,
                color,
                minDistance: 35,
                maxDistance: 125,
                minDuration: 450,
                maxDuration: 900,
                minSize: 3,
                maxSize: 7
            });

            highlightDrawMachine(color);

            return true;
        }

        return false;
    }

    /* =====================================================
       13. Settings and cleanup
       ===================================================== */

    function setEnabled(enabled) {
        effectsEnabled = Boolean(enabled);

        document.documentElement.classList.toggle(
            "vv-effects-disabled",
            !effectsEnabled
        );

        document.body?.classList.toggle(
            "vv-effects-disabled",
            !effectsEnabled
        );

        updateBackgroundVisibility();

        if (!effectsEnabled) {
            clearActiveEffects();
        }

        return effectsEnabled;
    }

    function isEnabled() {
        return effectsEnabled;
    }

    function clearActiveEffects() {
        for (const element of [...activeEffects]) {
            removeEffectElement(element);
        }
    }

    /* =====================================================
       14. Initialization
       ===================================================== */

    function initialize() {
        if (initialized || !document.body) return;

        initialized = true;

        ensureEffectLayer();
        initializeBackground();
        bindButtonEffects();

        const effectsToggle =
            $("effects-toggle") ||
            $("settings-effects-toggle") ||
            $("vv-setting-effects");

        if (
            effectsToggle &&
            effectsToggle.dataset.violetEffectBound !== "true"
        ) {
            effectsToggle.dataset.violetEffectBound = "true";

            effectsToggle.addEventListener("change", () => {
                setEnabled(effectsToggle.checked);
            });
        }

        if (REDUCED_MOTION?.addEventListener) {
            REDUCED_MOTION.addEventListener(
                "change",
                updateBackgroundVisibility
            );
        }

        console.log(
            "[Violet Vault] 시각 효과 시스템 로드 완료."
        );
    }

    /* =====================================================
       15. Public API
       ===================================================== */

    const VioletEffects = {
        init: initialize,

        toast,

        playWin,
        win: playWin,

        playParticles,
        particles: playParticles,

        setEnabled,
        isEnabled,

        clearActiveEffects,

        destroy() {
            clearActiveEffects();
            clearBackgroundParticles();

            effectLayer?.remove();
            effectLayer = null;

            initialized = false;
        }
    };

    window.VioletEffects = VioletEffects;

    /*
     * Older script.js versions use window.Effects.
     * Keep this compatibility bridge so existing calls continue
     * to work without requiring another change to script.js.
     */
    window.Effects = Object.assign(
        window.Effects || {},
        {
            toast,
            win: playWin,
            playParticles,
            setEnabled,
            isEnabled
        }
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
