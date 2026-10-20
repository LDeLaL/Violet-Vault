```javascript
/* =========================================================
   VIOLET VAULT
   Rarity System — rarity.js
   =========================================================

   담당 기능
   - 1 Q부터 100 Q까지 당첨 금액 생성
   - 희귀도 등급 판정
   - 등급별 당첨 확률 관리
   - 희귀도 목록 표시
   - 당첨 결과의 희귀도 정보 반환
   - 다른 시스템에서 사용할 희귀도 API 제공

   연결 파일
   - index.html
   - style.css
   - rarity.css
   - data.js
   - script.js
   - codex.js
   - effect.js

   중요
   - 실제 돈이 아닌 가상 화폐 게임이다.
   - 모든 당첨금은 정수 Q로 처리한다.
   ========================================================= */

(() => {
    "use strict";


    /* =====================================================
       1. 기본 데이터
       ===================================================== */

    const DATA = window.VioletVaultData || {};

    const MIN_REWARD = Number.isInteger(DATA.MIN_REWARD)
        ? DATA.MIN_REWARD
        : 1;

    const MAX_REWARD = Number.isInteger(DATA.MAX_REWARD)
        ? DATA.MAX_REWARD
        : 100;

    const CURRENCY = DATA.CURRENCY || "Q";


    /* =====================================================
       2. 등급별 확률 설정
       =====================================================

       각 숫자는 해당 희귀도 등급이 선택될 가중치다.

       현재 가중치 합계는 100이므로 가중치가
       곧 등급의 당첨 확률(%)이 된다.

       주의:
       등급의 확률과 그 등급에 포함된 개별 금액의
       확률은 서로 다르다.

       예시:
       Common은 45%로 선택되며,
       그 뒤 1~10 Q 중 금액 하나가 선택된다.
       ===================================================== */

    const TIER_WEIGHTS = {
        common: 45,
        uncommon: 25,
        rare: 15,
        epic: 8,
        legendary: 5,
        mythic: 1.8,
        ultimate: 0.2
    };


    /* =====================================================
       3. 기본 희귀도 정의
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


    /* =====================================================
       4. 유틸리티
       ===================================================== */

    function safeNumber(value, fallback = 0) {
        const number = Number(value);

        return Number.isFinite(number)
            ? number
            : fallback;
    }


    function clamp(value, min, max) {
        return Math.min(max, Math.max(min, value));
    }


    function formatAmount(value) {
        return Number(value).toLocaleString("en-US", {
            maximumFractionDigits: 2
        });
    }


    function escapeHTML(value) {
        return String(value)
            .replaceAll("&", "&amp;")
            .replaceAll("<", "&lt;")
            .replaceAll(">", "&gt;")
            .replaceAll('"', "&quot;")
            .replaceAll("'", "&#039;");
    }


    function getElement(id) {
        return document.getElementById(id);
    }


    /* =====================================================
       5. 등급 데이터 준비
       ===================================================== */

    function getTierId(tier) {
        if (tier.id) {
            return String(tier.id).toLowerCase();
        }

        return String(tier.name || "common")
            .toLowerCase()
            .replace(/[^a-z0-9_-]/g, "");
    }


    function getTierWeight(tier) {
        if (
            Number.isFinite(Number(tier.weight)) &&
            tier.weight >= 0
        ) {
            return Number(tier.weight);
        }

        if (
            Number.isFinite(Number(tier.chance)) &&
            tier.chance >= 0
        ) {
            return Number(tier.chance);
        }

        const id = getTierId(tier);

        if (Object.prototype.hasOwnProperty.call(
            TIER_WEIGHTS,
            id
        )) {
            return TIER_WEIGHTS[id];
        }

        return 0;
    }


    function normalizeTier(tier) {
        const min = Math.ceil(
            safeNumber(tier.min, MIN_REWARD)
        );

        const max = Math.floor(
            safeNumber(tier.max, MAX_REWARD)
        );

        const rawClass = String(
            tier.className || "rarity-common"
        );

        const className = rawClass
            .split(/\s+/)
            .filter(name => /^[a-zA-Z0-9_-]+$/.test(name))
            .join(" ");

        const rawColor = String(tier.color || "#aaa2bb");

        const color = /^#[0-9a-fA-F]{3,8}$/.test(rawColor)
            ? rawColor
            : "#aaa2bb";

        return {
            id: getTierId(tier),

            name: String(tier.name || "Common"),

            description: String(tier.description || ""),

            min: Math.max(MIN_REWARD, min),

            max: Math.min(MAX_REWARD, max),

            className: className || "rarity-common",

            color,

            symbol: String(tier.symbol || "◇"),

            weight: getTierWeight(tier)
        };
    }


    function loadRarities() {
        const source = Array.isArray(DATA.RARITIES) &&
            DATA.RARITIES.length > 0
                ? DATA.RARITIES
                : FALLBACK_RARITIES;

        const result = source
            .map(normalizeTier)
            .filter(tier =>
                tier.min <= tier.max &&
                tier.weight >= 0
            )
            .sort((a, b) => a.min - b.min);

        return result.length > 0
            ? result
            : FALLBACK_RARITIES.map(normalizeTier);
    }


    const RARITIES = loadRarities();


    /* =====================================================
       6. 확률 계산
       ===================================================== */

    function getTotalWeight() {
        return RARITIES.reduce(
            (total, tier) => total + tier.weight,
            0
        );
    }


    function getRarityChance(tierOrId) {
        const tier = typeof tierOrId === "object"
            ? tierOrId
            : getRarityById(tierOrId);

        if (!tier) {
            return 0;
        }

        const totalWeight = getTotalWeight();

        if (totalWeight <= 0) {
            return 0;
        }

        return tier.weight / totalWeight * 100;
    }


    function getRarityById(id) {
        const normalizedId = String(id).toLowerCase();

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


    /* =====================================================
       7. 희귀도 정보 반환
       =====================================================

       script.js와 codex.js가 공통으로 사용한다.

       VioletRarity.getRarityInfo(100)

       반환 예시:
       {
           id: "ultimate",
           name: "Ultimate",
           min: 100,
           max: 100,
           className: "rarity-ultimate",
           color: "#f1d5ff",
           symbol: "✹"
       }
       ===================================================== */

    function getRarityInfo(amount) {
        const tier = getRarityByAmount(amount);

        if (!tier) {
            return {
                id: "unknown",
                name: "Unknown",
                description: "확인할 수 없는 등급.",
                min: 0,
                max: 0,
                className: "rarity-common",
                color: "#aaa2bb",
                symbol: "?"
            };
        }

        return {
            id: tier.id,
            name: tier.name,
            description: tier.description,

            min: tier.min,
            max: tier.max,

            className: tier.className,
            color: tier.color,
            symbol: tier.symbol,

            chance: getRarityChance(tier)
        };
    }


    /* =====================================================
       8. 가중치로 희귀도 선택
       ===================================================== */

    function selectRandomRarity() {
        const totalWeight = getTotalWeight();

        if (totalWeight <= 0) {
            return RARITIES[0] || null;
        }

        let roll = Math.random() * totalWeight;

        for (const tier of RARITIES) {
            if (tier.weight <= 0) {
                continue;
            }

            roll -= tier.weight;

            if (roll < 0) {
                return tier;
            }
        }

        /*
         * 부동소수점 계산 때문에 끝부분에서 오차가
         * 생기는 경우 마지막 유효 등급을 반환한다.
         */

        for (let i = RARITIES.length - 1; i >= 0; i--) {
            if (RARITIES[i].weight > 0) {
                return RARITIES[i];
            }
        }

        return RARITIES[0] || null;
    }


    /* =====================================================
       9. 금액 생성
       =====================================================

       선택된 희귀도 범위 안에서 정수 금액 하나를
       균등한 확률로 선택한다.

       예:
       Common 선택 -> 1~10 중 한 금액
       Mythic 선택 -> 86~99 중 한 금액
       Ultimate 선택 -> 100

       script.js는 반환된 객체의 amount 속성을 사용한다.
       ===================================================== */

    function drawReward() {
        const tier = selectRandomRarity();

        if (!tier) {
            return {
                amount: MIN_REWARD,
                rarity: getRarityInfo(MIN_REWARD)
            };
        }

        const minimum = Math.max(
            MIN_REWARD,
            Math.ceil(tier.min)
        );

        const maximum = Math.min(
            MAX_REWARD,
            Math.floor(tier.max)
        );

        const amount = minimum === maximum
            ? minimum
            : Math.floor(
                Math.random() * (maximum - minimum + 1)
            ) + minimum;

        return {
            amount,
            rarity: getRarityInfo(amount)
        };
    }


    /* =====================================================
       10. 희귀도 목록 화면
       =====================================================

       index.html의 #rarity-list 내용을 갱신한다.

       기존 rarity.css의 다음 클래스를 사용한다.
       - rarity-row
       - rarity-dot
       - rarity-range
       ===================================================== */

    function renderList() {
        const container = getElement("rarity-list");

        if (!container) {
            return;
        }

        const totalWeight = getTotalWeight();

        container.innerHTML = RARITIES.map(tier => {
            const chance = totalWeight > 0
                ? tier.weight / totalWeight * 100
                : 0;

            const chanceText = chance < 0.1
                ? `${chance.toFixed(3)}%`
                : `${chance.toFixed(chance < 1 ? 2 : 1)}%`;

            const rangeText = tier.min === tier.max
                ? `${tier.min} ${CURRENCY}`
                : `${tier.min}~${tier.max} ${CURRENCY}`;

            return `
                <div class="rarity-row ${escapeHTML(tier.className)}"
                     title="${escapeHTML(tier.description)}">

                    <span class="rarity-dot"></span>

                    <span class="rarity-name">
                        ${escapeHTML(tier.name)}
                    </span>

                    <span class="rarity-range">
                        ${escapeHTML(rangeText)}
                        · ${chanceText}
                    </span>

                </div>
            `;
        }).join("");
    }


    /* =====================================================
       11. 등급별 통계 도우미
       ===================================================== */

    function getRarityCounts(history) {
        const counts = {};

        RARITIES.forEach(tier => {
            counts[tier.id] = 0;
        });

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

        const totalDraws = Object.values(counts).reduce(
            (sum, count) => sum + count,
            0
        );

        return RARITIES.map(tier => ({
            id: tier.id,
            name: tier.name,

            count: counts[tier.id],

            chance: getRarityChance(tier),

            actualRate: totalDraws > 0
                ? counts[tier.id] / totalDraws * 100
                : 0
        }));
    }


    /* =====================================================
       12. 설정용 API
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


    /* =====================================================
       13. 공개 API
       ===================================================== */

    const VioletRarity = {
        // 뽑기
        drawReward,

        // 희귀도 조회
        getRarityInfo,
        getRarityByAmount,
        getRarityById,
        getRarityChance,

        // 희귀도 목록
        getAllRarities,
        renderList,

        // 통계
        getRarityCounts,
        getRarityStatistics,

        // 유효성 검사
        isValidReward,

        get minReward() {
            return MIN_REWARD;
        },

        get maxReward() {
            return MAX_REWARD;
        }
    };


    /* =====================================================
       14. 전역 등록
       ===================================================== */

    window.VioletRarity = VioletRarity;

    console.log(
        "[Violet Vault] 희귀도 시스템 로드 완료."
    );

})();
```
