/* =========================================================
   VIOLET VAULT
   Game Data & Configuration — data.js
   =========================================================

   이 파일은 사이트 전체에서 사용하는 기본 데이터를 관리한다.
   다른 파일에서는 window.VioletVaultData 를 통해 접근한다.
   ========================================================= */

(() => {
    "use strict";

    /* =====================================================
       1. 기본 게임 설정
       ===================================================== */

    const SETTINGS = {
        SITE_NAME: "Violet Vault",
        SITE_SUBTITLE: "YOUR FORTUNE, YOUR DESTINY",
        CURRENCY: "Q",
        STARTING_BALANCE: 100,
        DRAW_COST: 1,
        MIN_REWARD: 1,
        MAX_REWARD: 100,
        HISTORY_LIMIT: 300,
        AUTO_DRAW_DELAY: 1000,
        DRAW_ANIMATION_DURATION: 750,
        DRAW_ANIMATION_SPEED: 65,
        DEFAULT_EFFECTS_ENABLED: true,
        DEFAULT_ANIMATIONS_ENABLED: true
    };

    /* =====================================================
       2. 당첨 금액 범위
       ===================================================== */

    const REWARD_CONFIG = {
        MIN: SETTINGS.MIN_REWARD,
        MAX: SETTINGS.MAX_REWARD,
        INTEGER_ONLY: true,
        ALLOW_DUPLICATES: true
    };

    /* =====================================================
       3. 희귀도 데이터
       기존 등급과 금액 구간은 그대로 유지한다.
       ===================================================== */

    const RARITIES = [
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
            description: "상당히 높은 금액의 등급.",
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
       4. 기본 업적 데이터
       상세 업적 UI는 achievements.js에서 관리한다.
       ===================================================== */

    const ACHIEVEMENTS = [
        {
            id: "first-draw",
            name: "첫걸음",
            description: "첫 번째 뽑기를 진행하세요.",
            target: 1,
            condition: "totalDraws"
        },
        {
            id: "lucky-hit",
            name: "행운의 시작",
            description: "10 Q 이상 당첨되세요.",
            target: 10,
            condition: "bestWin"
        },
        {
            id: "small-rich",
            name: "작은 부자",
            description: "누적 수익 100 Q를 달성하세요.",
            target: 100,
            condition: "totalIncome"
        },
        {
            id: "collector",
            name: "수집가",
            description: "서로 다른 금액 10종을 수집하세요.",
            target: 10,
            condition: "codexCount"
        },
        {
            id: "veteran",
            name: "뽑기의 달인",
            description: "총 100회 뽑기를 진행하세요.",
            target: 100,
            condition: "totalDraws"
        },
        {
            id: "ultimate",
            name: "궁극의 행운",
            description: "100 Q에 당첨되세요.",
            target: 100,
            condition: "highestReward"
        }
    ];

    /* =====================================================
       5. 가상 기업 데이터
       ===================================================== */

    const STOCKS = [
        {
            id: "violet-tech",
            name: "Violet Technologies",
            symbol: "VLT",
            description: "차세대 기술을 연구하는 가상 기업.",
            initialPrice: 50,
            volatility: 0.04,
            color: "#bd83ff"
        },
        {
            id: "crystal-energy",
            name: "Crystal Energy",
            symbol: "CRY",
            description: "에너지 사업을 운영하는 가상 기업.",
            initialPrice: 35,
            volatility: 0.03,
            color: "#73dca5"
        },
        {
            id: "nebula-industries",
            name: "Nebula Industries",
            symbol: "NEB",
            description: "우주 산업에 투자하는 가상 기업.",
            initialPrice: 80,
            volatility: 0.06,
            color: "#62a9ff"
        },
        {
            id: "shadow-media",
            name: "Shadow Media",
            symbol: "SHD",
            description: "게임과 미디어를 제작하는 가상 기업.",
            initialPrice: 25,
            volatility: 0.05,
            color: "#ff80d0"
        },
        {
            id: "royal-finance",
            name: "Royal Finance",
            symbol: "RYF",
            description: "금융 서비스를 제공하는 가상 기업.",
            initialPrice: 100,
            volatility: 0.025,
            color: "#ffcf70"
        }
    ];

    /* =====================================================
       6. 은행 설정
       ===================================================== */

    const BANK_CONFIG = {
        INTEREST_RATE: 0,
        HAS_DEADLINE: false,
        ALLOW_PARTIAL_REPAYMENT: true,
        MAX_REPAYMENT_IS_DEBT: true,
        MAX_LOAN: null
    };

    /* =====================================================
       7. 도감 설정
       ===================================================== */

    const CODEX_CONFIG = {
        MIN_AMOUNT: REWARD_CONFIG.MIN,
        MAX_AMOUNT: REWARD_CONFIG.MAX,
        TOTAL_VARIANTS:
            REWARD_CONFIG.MAX - REWARD_CONFIG.MIN + 1,
        UNIQUE_ENTRIES: true
    };

    /* =====================================================
       8. 통계 설정
       ===================================================== */

    const STATISTICS_CONFIG = {
        TRACK_TOTAL_DRAWS: true,
        TRACK_TOTAL_INCOME: true,
        TRACK_TOTAL_EXPENSES: true,
        TRACK_BEST_WIN: true,
        TRACK_NET_WORTH: true,
        TRACK_STOCK_PROFIT: true,
        TRACK_RARITY_COUNTS: true
    };

    /* =====================================================
       9. 효과 설정
       ===================================================== */

    const EFFECT_CONFIG = {
        SPECIAL_EFFECT_MIN_AMOUNT: 66,
        ULTIMATE_EFFECT_AMOUNT: 100,
        BACKGROUND_PARTICLES_ENABLED: true,
        BUTTON_EFFECTS_ENABLED: true,
        SCREEN_SHAKE_ENABLED: true
    };

    /* =====================================================
       10. 공개 데이터 및 호환성 별칭

       새 모듈은 최상위 설정값을 사용하고,
       기존 모듈 중 일부는 DATA.SETTINGS.* 를 사용한다.

       두 경로를 모두 제공해 설정 불일치를 방지한다.
       ===================================================== */

    const VioletVaultData = {
        ...SETTINGS,

        // 이전 모듈의 설정 접근 방식도 지원
        SETTINGS: { ...SETTINGS },

        REWARD_CONFIG,
        RARITIES,
        ACHIEVEMENTS,
        STOCKS,
        BANK_CONFIG,
        CODEX_CONFIG,
        STATISTICS_CONFIG,
        EFFECT_CONFIG
    };

    /* =====================================================
       11. 데이터 검색 도우미
       ===================================================== */

    // 금액으로 희귀도 찾기
    VioletVaultData.getRarityByAmount = function (amount) {
        const value = Number(amount);

        if (!Number.isFinite(value)) {
            return null;
        }

        return RARITIES.find(rarity =>
            value >= rarity.min &&
            value <= rarity.max
        ) || null;
    };

    // ID로 희귀도 찾기
    VioletVaultData.getRarityById = function (id) {
        return RARITIES.find(
            rarity => rarity.id === id
        ) || null;
    };

    // ID로 가상 기업 찾기
    VioletVaultData.getStockById = function (id) {
        return STOCKS.find(
            stock => stock.id === id
        ) || null;
    };

    // 주식 종목 코드로 가상 기업 찾기
    VioletVaultData.getStockBySymbol = function (symbol) {
        const normalizedSymbol = String(
            symbol ?? ""
        ).trim().toUpperCase();

        return STOCKS.find(
            stock => stock.symbol === normalizedSymbol
        ) || null;
    };

    // 당첨 금액이 유효한지 확인
    VioletVaultData.isValidReward = function (amount) {
        const value = Number(amount);

        if (!Number.isFinite(value)) {
            return false;
        }

        if (
            REWARD_CONFIG.INTEGER_ONLY &&
            !Number.isInteger(value)
        ) {
            return false;
        }

        return (
            value >= REWARD_CONFIG.MIN &&
            value <= REWARD_CONFIG.MAX
        );
    };

    /* =====================================================
       12. 전역 등록
       ===================================================== */

    window.VioletVaultData = VioletVaultData;

    console.log(
        "[Violet Vault] 게임 데이터 로드 완료."
    );
})();
