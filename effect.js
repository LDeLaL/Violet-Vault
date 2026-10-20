/* =========================================================
   VIOLET VAULT
   Visual Effects System — effect.js
   =========================================================

   담당 기능
   - 보라색 배경 파티클
   - 버튼 클릭 효과
   - 당첨 파티클
   - 희귀 당첨 연출
   - Ultimate 당첨 특수 효과
   - 화면 플래시 및 흔들림
   - 설정에 따른 효과 활성화 및 비활성화
   - 모바일 및 애니메이션 감소 설정 대응

   연결 파일
   - index.html
   - style.css
   - script.js
   - data.js
   - effect.css

   외부 공개 API
   window.VioletEffects.playWin()
   window.VioletEffects.setEnabled()
   window.VioletEffects.playParticles()
   window.VioletEffects.destroy()
   ========================================================= */

(() => {
    "use strict";

    /* =====================================================
       1. 설정
       ===================================================== */

    const DATA = window.VioletVaultData || {};
    const CONFIG = DATA.EFFECT_CONFIG || {};

    const DEFAULT_SPECIAL_MIN = 66;
    const DEFAULT_ULTIMATE_AMOUNT = 100;

    const SPECIAL_EFFECT_MIN_AMOUNT = Number.isFinite(
        Number(CONFIG.SPECIAL_EFFECT_MIN_AMOUNT)
    )
        ? Number(CONFIG.SPECIAL_EFFECT_MIN_AMOUNT)
        : DEFAULT_SPECIAL_MIN;

    const ULTIMATE_EFFECT_AMOUNT = Number.isFinite(
        Number(CONFIG.ULTIMATE_EFFECT_AMOUNT)
    )
        ? Number(CONFIG.ULTIMATE_EFFECT_AMOUNT)
        : DEFAULT_ULTIMATE_AMOUNT;

    const BACKGROUND_ENABLED =
        CONFIG.BACKGROUND_PARTICLES_ENABLED !== false;

    const BUTTON_EFFECTS_ENABLED =
        CONFIG.BUTTON_EFFECTS_ENABLED !== false;

    const SCREEN_SHAKE_ENABLED =
        CONFIG.SCREEN_SHAKE_ENABLED !== false;

    const REDUCED_MOTION_QUERY =
        window.matchMedia
            ? window.matchMedia("(prefers-reduced-motion: reduce)")
            : null;

    let effectsEnabled = readSavedEffectSetting();

    let backgroundInitialized = false;
    let interactionInitialized = false;

    let backgroundParticles = [];
    let activeEffects = new Set();

    let effectLayer = null;
    let backgroundContainer = null;


    /* =====================================================
       2. 기본 도구
       ===================================================== */

    function random(min, max) {
        return Math.random() * (max - min) + min;
    }

    function randomInt(min, max) {
        return Math.floor(random(min, max + 1));
    }

    function clamp(value, min, max) {
        return Math.min(max, Math.max(min, value));
    }

    function isReducedMotion() {
        return Boolean(
            REDUCED_MOTION_QUERY &&
            REDUCED_MOTION_QUERY.matches
        );
    }

    function getElement(id) {
        return document.getElementById(id);
    }

    function getRandomPurple() {
        const colors = [
            "#a855f7",
            "#c084fc",
            "#d8b4fe",
            "#e9d5ff",
            "#9333ea",
            "#7e22ce"
        ];

        return colors[randomInt(0, colors.length - 1)];
    }

    function getRewardColor(amount) {
        if (amount >= ULTIMATE_EFFECT_AMOUNT) {
            return "#f1d5ff";
        }

        if (amount >= 86) {
            return "#ff80d0";
        }

        if (amount >= 66) {
            return "#ffcf70";
        }

        if (amount >= 46) {
            return "#bd83ff";
        }

        if (amount >= 26) {
            return "#62a9ff";
        }

        return "#c084fc";
    }

    function getEffectOrigin() {
        const target =
            getElement("money-display") ||
            getElement("draw-machine");

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

    function readSavedEffectSetting() {
        try {
            const raw = localStorage.getItem(
                "violet-vault-save-v1"
            );

            if (!raw) {
                return true;
            }

            const saved = JSON.parse(raw);

            if (
                saved &&
                saved.settings &&
                typeof saved.settings.effectsEnabled === "boolean"
            ) {
                return saved.settings.effectsEnabled;
            }
        } catch (error) {
            // 저장된 설정이 없으면 기본값을 사용한다.
        }

        return true;
    }


    /* =====================================================
       3. 효과 레이어
       ===================================================== */

    function ensureEffectLayer() {
        if (effectLayer && effectLayer.isConnected) {
            return effectLayer;
        }

        effectLayer = document.createElement("div");

        effectLayer.id = "violet-effect-layer";
        effectLayer.setAttribute("aria-hidden", "true");

        Object.assign(effectLayer.style, {
            position: "fixed",
            inset: "0",
            width: "100%",
            height: "100%",
            overflow: "hidden",
            pointerEvents: "none",
            zIndex: "9999",
            contain: "layout style paint"
        });

        document.body.appendChild(effectLayer);

        return effectLayer;
    }


    function addEffectElement(element) {
        ensureEffectLayer().appendChild(element);

        activeEffects.add(element);

        return element;
    }


    function removeEffectElement(element) {
        if (!element) return;

        if (element._violetAnimation) {
            element._violetAnimation.cancel();
            element._violetAnimation = null;
        }

        activeEffects.delete(element);

        element.remove();
    }


    function animateElement(element, keyframes, options = {}) {
        if (!element) return null;

        if (
            typeof element.animate !== "function" ||
            isReducedMotion()
        ) {
            return null;
        }

        const animation = element.animate(
            keyframes,
            {
                duration: options.duration || 700,
                easing: options.easing || "ease-out",
                fill: options.fill || "forwards",
                iterations: options.iterations || 1
            }
        );

        element._violetAnimation = animation;

        return animation;
    }


    /* =====================================================
       4. 배경 파티클 준비
       ===================================================== */

    function setBackgroundLayerOrder() {
        backgroundContainer = getElement("particle-background");

        if (!backgroundContainer) {
            return;
        }

        /*
         * 배경 파티클을 표시하되,
         * 사이트의 실제 UI 뒤에 배치한다.
         */

        backgroundContainer.style.zIndex = "0";
        backgroundContainer.style.pointerEvents = "none";
        backgroundContainer.style.overflow = "hidden";

        const appLayout = document.querySelector(".app-layout");
        const footer = document.querySelector(".site-footer");

        if (appLayout) {
            appLayout.style.position = "relative";
            appLayout.style.zIndex = "1";
        }

        if (footer) {
            footer.style.position = "relative";
            footer.style.zIndex = "1";
        }
    }


    function clearBackgroundParticles() {
        backgroundParticles.forEach(particle => {
            if (particle._violetAnimation) {
                particle._violetAnimation.cancel();
            }

            particle.remove();
        });

        backgroundParticles = [];
    }


    function createBackgroundParticle() {
        if (!backgroundContainer) return null;

        const particle = document.createElement("span");

        const size = random(2, 5);
        const duration = random(9000, 19000);

        const startX = random(0, 100);
        const startY = random(0, 100);

        const driftX = random(-65, 65);
        const driftY = random(-100, 100);

        const color = getRandomPurple();

        Object.assign(particle.style, {
            position: "absolute",
            left: `${startX}%`,
            top: `${startY}%`,
            width: `${size}px`,
            height: `${size}px`,
            borderRadius: "50%",
            background: color,
            boxShadow: `0 0 ${size * 4}px ${color}`,
            opacity: "0",
            pointerEvents: "none",
            willChange: "transform, opacity"
        });

        backgroundContainer.appendChild(particle);

        const animation = animateElement(
            particle,
            [
                {
                    transform: "translate3d(0, 0, 0) scale(.6)",
                    opacity: 0
                },
                {
                    transform: "translate3d(0, -10px, 0) scale(1)",
                    opacity: 0.65,
                    offset: 0.25
                },
                {
                    transform:
                        `translate3d(${driftX}px, ${driftY}px, 0) scale(.4)`,
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

        backgroundParticles.push(particle);

        return particle;
    }


    function initializeBackground() {
        if (
            backgroundInitialized ||
            !BACKGROUND_ENABLED ||
            !document.body
        ) {
            return;
        }

        backgroundInitialized = true;

        backgroundContainer = getElement("particle-background");

        if (!backgroundContainer) {
            return;
        }

        setBackgroundLayerOrder();

        if (!effectsEnabled) {
            return;
        }

        if (isReducedMotion()) {
            return;
        }

        clearBackgroundParticles();

        const isMobile = window.innerWidth <= 760;

        const particleCount = isMobile ? 14 : 32;

        for (let i = 0; i < particleCount; i++) {
            createBackgroundParticle();
        }
    }


    function updateBackgroundVisibility() {
        if (!backgroundContainer) {
            backgroundContainer = getElement("particle-background");
        }

        if (!backgroundContainer) return;

        const shouldShow =
            effectsEnabled &&
            BACKGROUND_ENABLED &&
            !isReducedMotion();

        backgroundContainer.style.visibility =
            shouldShow ? "visible" : "hidden";

        if (!shouldShow) {
            clearBackgroundParticles();
            return;
        }

        if (backgroundParticles.length === 0) {
            clearBackgroundParticles();

            const isMobile = window.innerWidth <= 760;
            const particleCount = isMobile ? 14 : 32;

            for (let i = 0; i < particleCount; i++) {
                createBackgroundParticle();
            }
        }
    }


    /* =====================================================
       5. 버튼 클릭 파티클
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

        const dx = random(-28, 28);
        const dy = random(-35, 15);

        const animation = animateElement(
            particle,
            [
                {
                    transform: "translate(0, 0) scale(1)",
                    opacity: 0.9
                },
                {
                    transform: `translate(${dx}px, ${dy}px) scale(0)`,
                    opacity: 0
                }
            ],
            {
                duration: random(300, 550)
            }
        );

        if (animation) {
            animation.onfinish = () => {
                removeEffectElement(particle);
            };
        } else {
            removeEffectElement(particle);
        }
    }


    function playButtonEffect(button) {
        if (
            !effectsEnabled ||
            !BUTTON_EFFECTS_ENABLED ||
            !button ||
            button.disabled ||
            isReducedMotion()
        ) {
            return;
        }

        const rect = button.getBoundingClientRect();

        const particleCount = 5;

        for (let i = 0; i < particleCount; i++) {
            createClickParticle(
                random(rect.left, rect.right),
                random(rect.top, rect.bottom),
                getRandomPurple()
            );
        }
    }


    function bindButtonEffects() {
        if (interactionInitialized) return;

        interactionInitialized = true;

        document.addEventListener("click", event => {
            const target = event.target;

            if (!(target instanceof Element)) {
                return;
            }

            const button = target.closest(
                "button.primary-button, " +
                "button.secondary-button, " +
                "button.icon-button, " +
                "button.menu-button, " +
                "button.text-button"
            );

            if (!button) return;

            playButtonEffect(button);
        });
    }


    /* =====================================================
       6. 화면 플래시
       ===================================================== */

    function playScreenFlash(color, opacity = 0.18) {
        if (!effectsEnabled || isReducedMotion()) {
            return;
        }

        const flash = document.createElement("div");

        Object.assign(flash.style, {
            position: "fixed",
            inset: "0",
            background: color,
            opacity: String(clamp(opacity, 0, 0.35)),
            pointerEvents: "none",
            mixBlendMode: "screen"
        });

        addEffectElement(flash);

        const animation = animateElement(
            flash,
            [
                {
                    opacity: clamp(opacity, 0, 0.35)
                },
                {
                    opacity: 0
                }
            ],
            {
                duration: 500,
                easing: "ease-out"
            }
        );

        if (animation) {
            animation.onfinish = () => {
                removeEffectElement(flash);
            };
        } else {
            removeEffectElement(flash);
        }
    }


    /* =====================================================
       7. 파티클 폭발
       ===================================================== */

    function createBurstParticle(
        originX,
        originY,
        color,
        options = {}
    ) {
        const particle = document.createElement("span");

        const size = random(
            options.minSize || 3,
            options.maxSize || 8
        );

        const shape = randomInt(0, 2);

        Object.assign(particle.style, {
            position: "absolute",
            left: `${originX - size / 2}px`,
            top: `${originY - size / 2}px`,
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
            options.minDistance || 45,
            options.maxDistance || 145
        );

        const dx = Math.cos(angle) * distance;
        const dy = Math.sin(angle) * distance;

        const rotation = randomInt(-360, 360);
        const duration = random(
            options.minDuration || 500,
            options.maxDuration || 1000
        );

        const animation = animateElement(
            particle,
            [
                {
                    transform: "translate(0, 0) scale(.35) rotate(0deg)",
                    opacity: 1
                },
                {
                    transform:
                        `translate(${dx}px, ${dy}px) ` +
                        `scale(1) rotate(${rotation}deg)`,
                    opacity: 0.9,
                    offset: 0.25
                },
                {
                    transform:
                        `translate(${dx * 1.2}px, ${dy * 1.2}px) ` +
                        `scale(0) rotate(${rotation * 1.4}deg)`,
                    opacity: 0
                }
            ],
            {
                duration,
                easing: "cubic-bezier(.15,.65,.3,1)"
            }
        );

        if (animation) {
            animation.onfinish = () => {
                removeEffectElement(particle);
            };
        } else {
            removeEffectElement(particle);
        }
    }


    function playParticles(options = {}) {
        if (!effectsEnabled || isReducedMotion()) {
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
            const particleColor =
                Math.random() < 0.28
                    ? getRandomPurple()
                    : color;

            createBurstParticle(
                origin.x,
                origin.y,
                particleColor,
                {
                    minDistance: options.minDistance || 45,
                    maxDistance: options.maxDistance || 145,
                    minDuration: options.minDuration || 500,
                    maxDuration: options.maxDuration || 1050,
                    minSize: options.minSize || 3,
                    maxSize: options.maxSize || 8
                }
            );
        }

        return true;
    }


    /* =====================================================
       8. 빛의 고리
       ===================================================== */

    function createGlowRing(origin, color, size = 90) {
        if (!effectsEnabled || isReducedMotion()) {
            return;
        }

        const ring = document.createElement("div");

        Object.assign(ring.style, {
            position: "absolute",
            left: `${origin.x}px`,
            top: `${origin.y}px`,
            width: `${size}px`,
            height: `${size}px`,
            border: `2px solid ${color}`,
            borderRadius: "50%",
            boxShadow: `0 0 20px ${color}, inset 0 0 12px ${color}`,
            transform: "translate(-50%, -50%) scale(.2)",
            opacity: "0.95"
        });

        addEffectElement(ring);

        const animation = animateElement(
            ring,
            [
                {
                    transform: "translate(-50%, -50%) scale(.2)",
                    opacity: 0.95
                },
                {
                    transform: "translate(-50%, -50%) scale(2.8)",
                    opacity: 0
                }
            ],
            {
                duration: 750,
                easing: "ease-out"
            }
        );

        if (animation) {
            animation.onfinish = () => {
                removeEffectElement(ring);
            };
        } else {
            removeEffectElement(ring);
        }
    }


    /* =====================================================
       9. 뽑기 화면 강조
       ===================================================== */

    function highlightDrawMachine(color) {
        const machine = getElement("draw-machine");

        if (!machine || !effectsEnabled) {
            return;
        }

        machine.style.transition =
            "border-color 150ms ease, box-shadow 150ms ease";

        machine.style.borderColor = color;

        machine.style.boxShadow =
            `inset 0 0 42px ${color}22, ` +
            `0 0 28px ${color}35`;

        window.setTimeout(() => {
            if (!machine.isConnected) return;

            machine.style.borderColor = "";
            machine.style.boxShadow = "";
        }, 850);
    }


    /* =====================================================
       10. 화면 흔들림
       ===================================================== */

    function shakeDrawMachine() {
        if (
            !effectsEnabled ||
            !SCREEN_SHAKE_ENABLED ||
            isReducedMotion()
        ) {
            return;
        }

        const machine = getElement("draw-machine");

        if (!machine || typeof machine.animate !== "function") {
            return;
        }

        const animation = machine.animate(
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

        /*
         * 이 애니메이션은 요소의 원래 스타일을 변경하지 않는다.
         * 기존 레이아웃을 유지한 채 잠깐만 흔들린다.
         */

        return animation;
    }


    /* =====================================================
       11. 최고 금액 전용 연출
       ===================================================== */

    function playUltimateEffect() {
        if (!effectsEnabled) return false;

        if (isReducedMotion()) {
            playScreenFlash("#a855f7", 0.08);
            return true;
        }

        const origin = getEffectOrigin();

        playScreenFlash("#a855f7", 0.22);

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

        return true;
    }


    /* =====================================================
       12. 희귀 당첨 연출
       ===================================================== */

    function playWin(options = {}) {
        if (!effectsEnabled) {
            return false;
        }

        const amount = Number(
            typeof options === "number"
                ? options
                : options.amount
        );

        if (
            !Number.isFinite(amount) ||
            amount < 1
        ) {
            return false;
        }

        const rarity = typeof options === "object"
            ? options.rarity || {}
            : {};

        const color = getRewardColor(amount);

        const origin = getEffectOrigin();

        /*
         * 100 Q:
         * 최고 단계 특수 연출
         */

        if (amount >= ULTIMATE_EFFECT_AMOUNT) {
            return playUltimateEffect();
        }

        /*
         * 86~99 Q:
         * Mythic 연출
         */

        if (amount >= 86) {
            playScreenFlash(color, 0.13);

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

        /*
         * 66~85 Q:
         * Legendary 연출
         */

        if (amount >= SPECIAL_EFFECT_MIN_AMOUNT) {
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

        /*
         * 그보다 낮은 금액은 기본 뽑기 애니메이션을 사용한다.
         */

        return false;
    }


    /* =====================================================
       13. 효과 설정
       ===================================================== */

    function setEnabled(enabled) {
        effectsEnabled = Boolean(enabled);

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
        [...activeEffects].forEach(element => {
            removeEffectElement(element);
        });
    }


    /* =====================================================
       14. 초기화
       ===================================================== */

    function initialize() {
        if (!document.body) {
            return;
        }

        setBackgroundLayerOrder();

        ensureEffectLayer();

        bindButtonEffects();

        initializeBackground();

        updateBackgroundVisibility();

        /*
         * 설정 메뉴의 시각 효과 체크박스와 연결한다.
         */

        const effectsToggle = getElement("effects-toggle");

        if (effectsToggle) {
            effectsToggle.addEventListener("change", () => {
                setEnabled(effectsToggle.checked);
            });
        }

        console.log(
            "[Violet Vault] 시각 효과 시스템 로드 완료."
        );
    }


    /* =====================================================
       15. 공개 API
       ===================================================== */

    window.VioletEffects = {
        init: initialize,

        playWin,

        playParticles,

        setEnabled,

        isEnabled,

        clearActiveEffects,

        destroy() {
            clearActiveEffects();
            clearBackgroundParticles();

            backgroundInitialized = false;

            if (effectLayer) {
                effectLayer.remove();
                effectLayer = null;
            }
        }
    };


    /* =====================================================
       16. 실행
       ===================================================== */

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
