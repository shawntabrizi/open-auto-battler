mod starter_pack;

use crate::config::GameConfig;

pub fn get_game(name: &str) -> Option<Box<dyn GameConfig>> {
    match name {
        "starter_pack" => Some(Box::new(starter_pack::StarterPackConfig)),
        _ => None,
    }
}

pub fn available_games() -> &'static [&'static str] {
    &["starter_pack"]
}
