/* =========================================================
   VIOLET VAULT
   Game Data & Configuration — data.js
   =========================================================

   이 파일은 사이트 전체에서 사용하는 기본 데이터를 관리한다.

   주요 데이터
   - 기본 경제 설정
   - 뽑기 설정
   - 희귀도 등급
   - 가상 기업 데이터
   - 업적 데이터
   - 자동 뽑기 및 기록 설정

   다른 파일에서는 window.VioletVaultData 를 통해 접근한다.
   ========================================================= */

(() => {
    "use strict";

    /* =====================================================
       1. 기본 게임 설정
       ===================================================== */

    const SETTINGS = {
        // 사이트 이름
        SITE_NAME: "Violet Vault",

        // 사이트 부제목
        SITE_SUBTITLE: "YOUR FORTUNE, YOUR DESTINY",

        // 기본 가상 화폐 단위
        CURRENCY: "Q",

        // 처음 시작할 때 지급하는 금액
        STARTING_BALANCE: 100,

        // 1회 뽑기 비용
        DRAW_COST: 1,

        // 뽑기로 얻을 수 있는 최소 금액
        MIN_REWARD: 1,

        // 뽑기로 얻을 수 있는 최대 금액
        MAX_REWARD: 100,

        // 거래 기록 최대 저장 개수
        HISTORY_LIMIT: 300,

        // 자동 뽑기 사이의 대기 시간 (밀리초)
        AUTO_DRAW_DELAY: 1000,

        // 일반 뽑기 애니메이션 시간 (밀리초)
        DRAW_ANIMATION_DURATION: 750,

        // 뽑기 애니메이션 숫자 변경 간격 (밀리초)
        DRAW_ANIMATION_SPEED: 65,

        // 애니메이션 효과 기본값
        DEFAULT_EFFECTS_ENABLED: true,

        // 애니메이션 기본값
        DEFAULT_ANIMATIONS_ENABLED: true
    };


    /* =====================================================
       2. 당첨 금액 범위
       ===================================================== */

    const REWARD_CONFIG = {
        MIN: 1,
        MAX: 100,

        /*
         * 현재 당첨 금액은 정수 단위로 설정한다.
         *
         * 가능한 결과:
         * 1 Q, 2 Q, 3 Q ... 99 Q, 100 Q
         *
         * 총 100가지 금액이다.
         */
        INTEGER_ONLY: true,

        // 중복 금액의 당첨을 허용한다.
        ALLOW_DUPLICATES: true
    };


    /* =====================================================
       3. 희귀도 데이터
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
       4. 업적 데이터
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
       =====================================================

       아래 기업들은 실제 상장 기업이 아니라
       Violet Vault 전용 가상 기업이다.

       initialPrice: 최초 주가
       volatility: 주가 변동 폭 설정
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
        // 대출 이율
        INTEREST_RATE: 0,

        // 상환 기한 제한 없음
        HAS_DEADLINE: false,

        // 부분 상환 허용
        ALLOW_PARTIAL_REPAYMENT: true,

        // 원금을 초과하여 상환할 수 없음
        MAX_REPAYMENT_IS_DEBT: true,

        /*
         * 최대 대출 한도
         *
         * null은 이 설정 자체에서 한도를 지정하지 않는다는 뜻이다.
         * 실제 대출 가능 금액은 bank.js의 구현에 따라 결정된다.
         */
        MAX_LOAN: null
    };


    /* =====================================================
       7. 도감 설정
       ===================================================== */

    const CODEX_CONFIG = {
        MIN_AMOUNT: 1,
        MAX_AMOUNT: 100,

        // 서로 다른 당첨 금액 종류의 총개수
        TOTAL_VARIANTS: 100,

        // 동일 금액을 여러 번 뽑아도 도감 종류는 중복되지 않는다.
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
        // 희귀 당첨 연출을 적용할 최소 금액
        SPECIAL_EFFECT_MIN_AMOUNT: 66,

        // 최고 금액 당첨 전용 연출
        ULTIMATE_EFFECT_AMOUNT: 100,

        // 페이지 배경 파티클
        BACKGROUND_PARTICLES_ENABLED: true,

        // 버튼 클릭 효과
        BUTTON_EFFECTS_ENABLED: true,

        // 당첨 화면 흔들림
        SCREEN_SHAKE_ENABLED: true
    };


    /* =====================================================
       10. 공개 데이터
       =====================================================

       다른 파일에서는 아래 이름으로 데이터를 읽는다.

       예시:
       window.VioletVaultData.DRAW_COST
       window.VioletVaultData.RARITIES
       window.VioletVaultData.STOCKS
       ===================================================== */

    const VioletVaultData = {
        ...SETTINGS,

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


    VioletVaultData.getRarityById = function (id) {
        return RARITIES.find(
            rarity => rarity.id === id
        ) || null;
    };


    VioletVaultData.getStockById = function (id) {
        return STOCKS.find(
            stock => stock.id === id
        ) || null;
    };


    VioletVaultData.getStockBySymbol = function (symbol) {
        const normalizedSymbol = String(symbol).toUpperCase();

        return STOCKS.find(
            stock => stock.symbol === normalizedSymbol
        ) || null;
    };


    VioletVaultData.isValidReward = function (amount) {
        const value = Number(amount);

        return (
            Number.isInteger(value) &&
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
