#[test]
fn test_log_helpers_do_not_panic_without_browser_log_feature() {
    crate::log::info("info");
    crate::log::warn("warn");
    crate::log::error("error");
    crate::log::debug("label", "debug");
    crate::log::state_summary("shop", 1, 2, 3, 4, 5, 6, 7);
    crate::log::action("play", "slot=0");
    crate::log::result(true, "ok");
    crate::log::result(false, "fail");
}
