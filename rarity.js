/* =========================================================
   VIOLET VAULT
   Rarity System — rarity.js
   =========================================================

   - 정수 Q 보상 생성
   - 데이터 파일의 희귀도 구간 사용
   - 가중치 기반 희귀도 선택
   - 희귀도 정보 및 확률 조회
   - 희귀도 목록 표시
   - 통계용 등급 집계
   - 기존 모듈 호환 API 제공
   ========================================================= */

(() => {
    "use strict";

    const DATA = window.VioletVaultData || {};
    const SETTINGS = DATA.SETTINGS || DATA;

    const MIN_REWARD = normalizeInteger(
        DATA.MIN_REWARD ?? SETTINGS.MIN_REWARD,
        1
    );

    const MAX_REWARD = normalizeInteger(
        DATA.MAX_REWARD ?? SETTINGS.MAX_REWARD,
        100
    );

    const CURRENCY = String(
        DATA.CURRENCY ?? SETTINGS.CURRENCY ?? "Q"
    );

    /*
     * 등급 선택 가중치.
     * 기존 7개 등급의 확률 설정을 유지한다.
     */
    const TIER_WEIGHTS = Object.freeze({
        common: 45,
        uncommon: 25,
        rare: 15,
        epic: 8,
        legendary: 5,
        mythic: 1.8,
        ultimate: 0.2
    });

    function normalizeInteger(value, fallback) {
        const number = Number(value);
        return Number.isInteger(number) ? number : fallback;
    }

    function safeNumber(value, fallback = 0) {
        const number = Number(value);
        return Number.isFinite(number) ? number : fallback;
    }

    function clamp(value, min, max) {
        return Math.min(max, Math.max(min, value));
    }

    function escapeHTML(value) {
        return String(value ?? "").replace(/[&<>"']/g, character => ({
            "&": "&amp;",
            "<": "&lt;",
            ">": "&gt;",
            '"': "&quot;",
            "'": "&#039;"
        })[character]);
    }

    function getElement(id) {
        return document.getElementById(id);
    }

    function formatAmount(value) {
        return safeNumber(value).toLocaleString("en-US", {
            maximumFractionDigits: 2
        });
    }

    /* =====================================================
       1. 등급 데이터 정규화
       ===================================================== */

    function getTierId(tier) {
        if (
            tier &&
            tier.id != null &&
            String(tier.id).trim()
        ) {
            return String(tier.id).trim().toLowerCase();
        }

        return String(tier?.name || "common")
            .toLowerCase()
            .replace(/[^a-z0-9_-]/g, "");
    }

    function getTierWeight(tier) {
        if (
            tier?.weight !== undefined &&
            tier?.weight !== null &&
            tier.weight !== ""
        ) {
            const weight = Number(tier.weight);

            if (Number.isFinite(weight) && weight >= 0) {
                return weight;
            }
        }

        if (
            tier?.chance !== undefined &&
            tier?.chance !== null &&
            tier.chance !== ""
        ) {
            const chance = Number(tier.chance);

            if (Number.isFinite(chance) && chance >= 0) {
                return chance;
            }
        }

        const id = getTierId(tier || {});

        return Object.prototype.hasOwnProperty.call(
            TIER_WEIGHTS,
            id
        )
            ? TIER_WEIGHTS[id]
            : 0;
    }

    function normalizeTier(tier) {
        const source = tier && typeof tier === "object"
            ? tier
            : {};

        const min = Math.ceil(
            safeNumber(source.min, MIN_REWARD)
        );

        const max = Math.floor(
            safeNumber(source.max, MAX_REWARD)
        );

        const rawClass = String(
            source.className || "rarity-common"
        );

        const className = rawClass
            .split(/\s+/)
            .filter(name => /^[a-zA-Z0-9_-]+$/.test(name))
            .join(" ");

        const rawColor = String(
            source.color || "#aaa2bb"
        );

        const color = /^#[0-9a-fA-F]{3,8}$/.test(rawColor)
            ? rawColor
            : "#aaa2bb";

        return {
            id: getTierId(source),

            name: String(source.name || "Common"),

            label: String(
                source.label || source.name || "Common"
            ),

            description: String(source.description || ""),

            min: Math.max(MIN_REWARD, min),

            max: Math.min(MAX_REWARD, max),

            className: className || "rarity-common",

            color,

            symbol: String(source.symbol || "◇"),

            weight: getTierWeight(source)
        };
    }

    /* =====================================================
       2. 기본 희귀도 정의
       DATA.RARITIES가 없을 때 사용하는 예비 데이터
       ===================================================== */

    const FALLBACK_RARITIES = [
        {
            id: "common",
            name: "Common",
            description: "가장 기본적인 등급.",
            min: 1,
            max: 10,
            className: "rarity-common",
            color: "#aaa2bb",
            symbol: "◇"
        },
        {
            id: "uncommon",
            name: "Uncommon",
            description: "조금 더 특별한 등급.",
            min: 11,
            max: 25,
            className: "rarity-uncommon",
            color: "#73dca5",
            symbol: "✧"
        },
        {
            id: "rare",
            name: "Rare",
            description: "쉽게 만나기 어려운 등급.",
            min: 26,
            max: 45,
            className: "rarity-rare",
            color: "#62a9ff",
            symbol: "✦"
        },
        {
            id: "epic",
            name: "Epic",
            description: "높은 금액의 등급.",
            min: 46,
            max: 65,
            className: "rarity-epic",
            color: "#bd83ff",
            symbol: "✷"
        },
        {
            id: "legendary",
            name: "Legendary",
            description: "매우 특별한 당첨 등급.",
            min: 66,
            max: 85,
            className: "rarity-legendary",
            color: "#ffcf70",
            symbol: "♛"
        },
        {
            id: "mythic",
            name: "Mythic",
            description: "아주 높은 금액의 등급.",
            min: 86,
            max: 99,
            className: "rarity-mythic",
            color: "#ff80d0",
            symbol: "☄"
        },
        {
            id: "ultimate",
            name: "Ultimate",
            description: "현재 당첨 가능한 최고 금액.",
            min: 100,
            max: 100,
            className: "rarity-ultimate",
            color: "#f1d5ff",
            symbol: "✹"
        }
    ];

    function loadRarities() {
        const configured =
            Array.isArray(DATA.RARITIES) &&
            DATA.RARITIES.length
                ? DATA.RARITIES
                : FALLBACK_RARITIES;

        const rarities = configured
            .map(normalizeTier)
            .filter(tier =>
                tier.min <= tier.max &&
                tier.weight >= 0
            )
            .sort((a, b) => a.min - b.min);

        return rarities.length
            ? rarities
            : FALLBACK_RARITIES.map(normalizeTier);
    }

    const RARITIES = loadRarities();

    /* =====================================================
       3. 확률 및 등급 조회
       ===================================================== */

    function getTotalWeight() {
        return RARITIES.reduce(
            (total, tier) => total + tier.weight,
            0
        );
    }

    function getRarityById(id) {
        const normalizedId = String(id ?? "")
            .trim()
            .toLowerCase();

        return RARITIES.find(
            tier => tier.id === normalizedId
        ) || null;
    }

    function getRarityByAmount(amount) {
        const value = Number(amount);

        if (
            !Number.isInteger(value) ||
            value < MIN_REWARD ||
            value > MAX_REWARD
        ) {
            return null;
        }

        return RARITIES.find(tier =>
            value >= tier.min &&
            value <= tier.max
        ) || null;
    }

    function getRarityChance(tierOrId) {
        const tier =
            typeof tierOrId === "object" && tierOrId !== null
                ? tierOrId
                : getRarityById(tierOrId);

        if (!tier) return 0;

        const total = getTotalWeight();

        if (total <= 0) return 0;

        return tier.weight / total * 100;
    }

    /* =====================================================
       4. 희귀도 정보 반환
       다른 파일에서 공통으로 사용하는 함수
       ===================================================== */

    function getRarityInfo(amount) {
        const tier = getRarityByAmount(amount);

        if (!tier) {
            return {
                id: "unknown",
                key: "unknown",
                name: "Unknown",
                label: "Unknown",
                description: "확인할 수 없는 등급.",
                min: 0,
                max: 0,
                className: "rarity-common",
                color: "#aaa2bb",
                symbol: "?",
                chance: 0
            };
        }

        return {
            id: tier.id,
            key: tier.id,
            name: tier.name,
            label: tier.label,
            description: tier.description,
            min: tier.min,
            max: tier.max,
            className: tier.className,
            color: tier.color,
            symbol: tier.symbol,
            weight: tier.weight,
            chance: getRarityChance(tier)
        };
    }

    /* =====================================================
       5. 가중치에 따른 희귀도 선택
       ===================================================== */

    function selectRandomRarity() {
        const totalWeight = getTotalWeight();

        if (totalWeight <= 0) {
            return RARITIES[0] || null;
        }

        let roll = Math.random() * totalWeight;

        for (const tier of RARITIES) {
            if (tier.weight <= 0) continue;

            roll -= tier.weight;

            if (roll < 0) {
                return tier;
            }
        }

        // 부동소수점 오차에 대비한 마지막 등급 선택
        for (
            let index = RARITIES.length - 1;
            index >= 0;
            index--
        ) {
            if (RARITIES[index].weight > 0) {
                return RARITIES[index];
            }
        }

        return RARITIES[0] || null;
    }

    /* =====================================================
       6. 당첨 금액 생성
       선택된 등급의 금액 구간에서 정수를 선택한다.
       ===================================================== */

    function drawReward() {
        const tier = selectRandomRarity();

        if (!tier) {
            const amount = MIN_REWARD;

            return {
                amount,
                prize: amount,
                rarity: getRarityInfo(amount)
            };
        }

        const min = Math.max(
            MIN_REWARD,
            Math.ceil(tier.min)
        );

        const max = Math.min(
            MAX_REWARD,
            Math.floor(tier.max)
        );

        const amount = min >= max
            ? min
            : Math.floor(
                Math.random() * (max - min + 1)
            ) + min;

        return {
            amount,
            prize: amount,
            rarity: getRarityInfo(amount)
        };
    }

    /* =====================================================
       7. 희귀도 목록 화면
       기존 rarity.css의 클래스를 유지한다.
       ===================================================== */

    function renderList() {
        const container = getElement("rarity-list");

        if (!container) return false;

        const totalWeight = getTotalWeight();

        container.innerHTML = RARITIES.map(tier => {
            const chance = totalWeight > 0
                ? tier.weight / totalWeight * 100
                : 0;

            const chanceText = chance < 0.1
                ? `${chance.toFixed(3)}%`
                : `${chance.toFixed(chance < 1 ? 2 : 1)}%`;

            const range = tier.min === tier.max
                ? `${tier.min} ${CURRENCY}`
                : `${tier.min}~${tier.max} ${CURRENCY}`;

            return `
                <div
                    class="rarity-row ${escapeHTML(tier.className)}"
                    title="${escapeHTML(tier.description)}">

                    <span class="rarity-dot"></span>

                    <span class="rarity-name">
                        ${escapeHTML(tier.name)}
                    </span>

                    <span class="rarity-range">
                        ${escapeHTML(range)} · ${chanceText}
                    </span>

                </div>
            `;
        }).join("");

        return true;
    }

    /* =====================================================
       8. 희귀도별 통계
       ===================================================== */

    function getRarityCounts(history) {
        const counts = Object.fromEntries(
            RARITIES.map(tier => [tier.id, 0])
        );

        if (!Array.isArray(history)) {
            return counts;
        }

        history.forEach(entry => {
            if (!entry || entry.type !== "draw") {
                return;
            }

            const tier = getRarityByAmount(
                Number(entry.amount)
            );

            if (tier) {
                counts[tier.id] += 1;
            }
        });

        return counts;
    }

    function getRarityStatistics(history) {
        const counts = getRarityCounts(history);

        const total = Object.values(counts).reduce(
            (sum, count) => sum + count,
            0
        );

        return RARITIES.map(tier => ({
            id: tier.id,
            name: tier.name,
            min: tier.min,
            max: tier.max,
            count: counts[tier.id],
            chance: getRarityChance(tier),
            actualRate: total > 0
                ? counts[tier.id] / total * 100
                : 0
        }));
    }

    /* =====================================================
       9. 설정 및 유효성 검사
       ===================================================== */

    function getAllRarities() {
        return RARITIES.map(tier => ({
            ...tier,
            chance: getRarityChance(tier)
        }));
    }

    function isValidReward(amount) {
        const value = Number(amount);

        return (
            Number.isInteger(value) &&
            value >= MIN_REWARD &&
            value <= MAX_REWARD &&
            getRarityByAmount(value) !== null
        );
    }

    // 특정 금액이 선택될 이론적 확률(%)
    function getNumberChance(amount) {
        const tier = getRarityByAmount(amount);

        if (!tier) return 0;

        const valuesInTier = tier.max - tier.min + 1;

        if (valuesInTier <= 0) return 0;

        return getRarityChance(tier) / valuesInTier;
    }

    /* =====================================================
       10. 공개 API
       ===================================================== */

    const VioletRarity = {
        drawReward,
        draw: drawReward,
        selectRandomRarity,

        getRarityInfo,
        get: getRarityInfo,

        getRarityByAmount,
        getByAmount: getRarityByAmount,
        getRarityById,
        getRarityChance,
        getNumberChance,

        getAllRarities,
        renderList,

        getRarityCounts,
        getRarityStatistics,

        isValidReward,
        getTotalWeight,

        get rarities() {
            return getAllRarities();
        },

        get minReward() {
            return MIN_REWARD;
        },

        get maxReward() {
            return MAX_REWARD;
        }
    };

    /* =====================================================
       11. 전역 등록 및 구버전 호환
       ===================================================== */

    window.VioletRarity = VioletRarity;

    // 구버전 script.js의 Rarity.get(amount) 호환
    if (!window.Rarity) {
        window.Rarity = {
            get: getRarityInfo,
            draw: drawReward,
            getRarityInfo,
            getRarityByAmount,
            getAllRarities,
            renderList
        };
    }

    console.log(
        "[Violet Vault] 희귀도 시스템 로드 완료."
    );
})();
