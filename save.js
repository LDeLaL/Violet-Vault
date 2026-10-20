/* =========================================================
   VIOLET VAULT
   Save System — save.js
   =========================================================

   담당 기능
   - 게임 데이터 저장
   - 저장 데이터 불러오기
   - 저장 데이터 초기화
   - 저장 데이터 유효성 확인
   - 저장 시간 기록
   - 손상되거나 잘못된 데이터 처리

   저장 위치
   - 브라우저 localStorage

   연결 파일
   - index.html
   - script.js

   중요
   - 실제 돈이나 개인정보를 저장하지 않는다.
   - 게임 진행 상황만 브라우저에 저장한다.
   ========================================================= */

(() => {
    "use strict";


    /* =====================================================
       1. 저장 설정
       ===================================================== */

    /*
     * 반드시 script.js의 STORAGE_KEY와 같아야 한다.
     * 이름이 다르면 기존 저장 데이터를 불러오지 못한다.
     */

    const STORAGE_KEY = "violet-vault-save-v1";

    const SAVE_VERSION = 1;

    const LAST_SAVED_KEY = "violet-vault-last-saved";

    /*
     * 브라우저 저장 공간을 사용할 수 없을 때
     * 현재 페이지 안에서만 임시로 사용하는 데이터.
     */

    let memorySave = null;

    let lastSavedAt = null;


    /* =====================================================
       2. 저장 기능 사용 가능 여부 확인
       ===================================================== */

    function isStorageAvailable() {
        try {
            const testKey = "__violet_vault_test__";

            localStorage.setItem(testKey, "test");
            localStorage.removeItem(testKey);

            return true;
        } catch (error) {
            return false;
        }
    }


    /* =====================================================
       3. 데이터 복사
       ===================================================== */

    /*
     * 저장할 데이터가 외부에서 변경되더라도
     * 원본 게임 상태에 영향을 주지 않도록 복사한다.
     */

    function cloneData(data) {
        if (data === undefined || data === null) {
            return null;
        }

        try {
            return JSON.parse(JSON.stringify(data));
        } catch (error) {
            console.error(
                "[Violet Vault Save] 데이터를 복사하지 못했습니다.",
                error
            );

            return null;
        }
    }


    /* =====================================================
       4. 저장 데이터 기본 검사
       ===================================================== */

    function isValidSaveData(data) {
        if (
            !data ||
            typeof data !== "object" ||
            Array.isArray(data)
        ) {
            return false;
        }

        /*
         * Violet Vault의 게임 상태에는
         * 보유 금액 정보가 반드시 있어야 한다.
         */

        if (
            typeof data.balance !== "number" ||
            !Number.isFinite(data.balance) ||
            data.balance < 0
        ) {
            return false;
        }

        /*
         * 핵심 데이터가 올바른 형태인지 검사한다.
         */

        if (
            data.history !== undefined &&
            !Array.isArray(data.history)
        ) {
            return false;
        }

        if (
            data.codex !== undefined &&
            !Array.isArray(data.codex)
        ) {
            return false;
        }

        if (
            data.unlockedAchievements !== undefined &&
            !Array.isArray(data.unlockedAchievements)
        ) {
            return false;
        }

        return true;
    }


    /* =====================================================
       5. 저장 시간 처리
       ===================================================== */

    function updateSavedTime(timestamp = Date.now()) {
        lastSavedAt = timestamp;

        try {
            localStorage.setItem(
                LAST_SAVED_KEY,
                String(timestamp)
            );
        } catch (error) {
            /*
             * 저장 시간 기록에 실패해도
             * 게임 데이터 저장 자체는 유지한다.
             */
        }
    }


    function getLastSavedAt() {
        if (lastSavedAt !== null) {
            return lastSavedAt;
        }

        try {
            const stored = localStorage.getItem(LAST_SAVED_KEY);

            if (stored === null) {
                return null;
            }

            const timestamp = Number(stored);

            if (!Number.isFinite(timestamp)) {
                return null;
            }

            lastSavedAt = timestamp;

            return timestamp;
        } catch (error) {
            return null;
        }
    }


    function getLastSavedDate() {
        const timestamp = getLastSavedAt();

        if (timestamp === null) {
            return null;
        }

        const date = new Date(timestamp);

        if (Number.isNaN(date.getTime())) {
            return null;
        }

        return date;
    }


    /* =====================================================
       6. 게임 데이터 저장
       ===================================================== */

    /*
     * script.js에서 호출하는 함수:
     *
     * VioletVaultSave.save(state);
     *
     * 현재 게임 상태 전체를 저장한다.
     */

    function save(state) {
        if (
            !state ||
            typeof state !== "object" ||
            Array.isArray(state)
        ) {
            console.error(
                "[Violet Vault Save] 잘못된 저장 요청입니다."
            );

            return false;
        }

        const snapshot = cloneData(state);

        if (!snapshot) {
            return false;
        }

        /*
         * 저장 메타데이터는 실제 게임 상태와
         * 별도로 관리한다.
         */

        snapshot.version = SAVE_VERSION;
        snapshot.savedAt = Date.now();

        if (!isValidSaveData(snapshot)) {
            console.error(
                "[Violet Vault Save] 저장할 데이터가 올바르지 않습니다."
            );

            return false;
        }

        /*
         * 우선 메모리에 저장한다.
         * 브라우저 저장 공간을 사용할 수 없더라도
         * 현재 페이지에서 작업이 완전히 중단되지는 않는다.
         */

        memorySave = snapshot;

        updateSavedTime(snapshot.savedAt);

        /*
         * localStorage에 영구 저장한다.
         */

        if (!isStorageAvailable()) {
            console.warn(
                "[Violet Vault Save] 브라우저 저장 공간을 사용할 수 없습니다. " +
                "현재 페이지에서만 임시 저장됩니다."
            );

            return false;
        }

        try {
            localStorage.setItem(
                STORAGE_KEY,
                JSON.stringify(snapshot)
            );

            console.log(
                "[Violet Vault Save] 저장 완료."
            );

            return true;
        } catch (error) {
            console.error(
                "[Violet Vault Save] 저장에 실패했습니다.",
                error
            );

            return false;
        }
    }


    /* =====================================================
       7. 저장 데이터 불러오기
       ===================================================== */

    /*
     * script.js에서 호출하는 함수:
     *
     * const state = VioletVaultSave.load();
     *
     * 저장 데이터가 없으면 null을 반환한다.
     */

    function load() {
        /*
         * 먼저 브라우저의 영구 저장 데이터를 확인한다.
         */

        if (isStorageAvailable()) {
            try {
                const raw = localStorage.getItem(STORAGE_KEY);

                if (raw !== null) {
                    const parsed = JSON.parse(raw);

                    if (isValidSaveData(parsed)) {
                        memorySave = parsed;

                        if (
                            Number.isFinite(parsed.savedAt)
                        ) {
                            lastSavedAt = parsed.savedAt;
                        }

                        console.log(
                            "[Violet Vault Save] 저장 데이터를 불러왔습니다."
                        );

                        return cloneData(parsed);
                    }

                    console.warn(
                        "[Violet Vault Save] 저장 데이터의 형식이 올바르지 않습니다."
                    );
                }
            } catch (error) {
                console.error(
                    "[Violet Vault Save] 데이터를 불러오지 못했습니다.",
                    error
                );
            }
        }

        /*
         * 영구 저장 데이터를 읽지 못한 경우,
         * 현재 페이지에 임시 저장된 데이터가 있다면 사용한다.
         */

        if (isValidSaveData(memorySave)) {
            return cloneData(memorySave);
        }

        /*
         * 저장 데이터가 없으면 null을 반환한다.
         * script.js에서 기본 게임 상태를 생성한다.
         */

        return null;
    }


    /* =====================================================
       8. 저장 데이터 존재 여부
       ===================================================== */

    function hasSave() {
        if (isValidSaveData(memorySave)) {
            return true;
        }

        if (!isStorageAvailable()) {
            return false;
        }

        try {
            const raw = localStorage.getItem(STORAGE_KEY);

            if (raw === null) {
                return false;
            }

            const parsed = JSON.parse(raw);

            return isValidSaveData(parsed);
        } catch (error) {
            return false;
        }
    }


    /* =====================================================
       9. 게임 데이터 초기화
       ===================================================== */

    /*
     * script.js의 초기화 기능에서 호출한다.
     *
     * VioletVaultSave.reset();
     *
     * 저장된 게임 데이터와 저장 시간을 삭제한다.
     */

    function reset() {
        memorySave = null;
        lastSavedAt = null;

        let success = true;

        try {
            localStorage.removeItem(STORAGE_KEY);
            localStorage.removeItem(LAST_SAVED_KEY);
        } catch (error) {
            success = false;

            console.error(
                "[Violet Vault Save] 저장 데이터를 초기화하지 못했습니다.",
                error
            );
        }

        console.log(
            "[Violet Vault Save] 초기화 완료."
        );

        return success;
    }


    /* =====================================================
       10. 저장 데이터 삭제
       ===================================================== */

    /*
     * 게임 초기화와 별개로 저장 데이터만 삭제한다.
     *
     * 주의:
     * 메모리에 남은 게임 상태를 초기화하는 것은 아니므로
     * 삭제한 다음 save()를 다시 호출하면 데이터가 재저장될 수 있다.
     */

    function removeSavedData() {
        memorySave = null;
        lastSavedAt = null;

        try {
            localStorage.removeItem(STORAGE_KEY);
            localStorage.removeItem(LAST_SAVED_KEY);

            return true;
        } catch (error) {
            console.error(
                "[Violet Vault Save] 저장 데이터 삭제 실패.",
                error
            );

            return false;
        }
    }


    /* =====================================================
       11. 저장 시스템 정보
       ===================================================== */

    function getInfo() {
        return {
            version: SAVE_VERSION,

            storageAvailable: isStorageAvailable(),

            hasSave: hasSave(),

            lastSavedAt: getLastSavedAt(),

            lastSavedDate: getLastSavedDate()
        };
    }


    /* =====================================================
       12. 공개 API 등록
       ===================================================== */

    window.VioletVaultSave = {
        save,
        load,
        reset,

        hasSave,

        getLastSavedAt,
        getLastSavedDate,

        getInfo,

        removeSavedData
    };


    /* =====================================================
       13. 시스템 초기화
       ===================================================== */

    console.log(
        "[Violet Vault Save] 저장 시스템 준비 완료."
    );

})();
