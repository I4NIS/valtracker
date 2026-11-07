use serde::de::{Deserializer, IgnoredAny, MapAccess, SeqAccess, Visitor};
use serde::Deserialize;
use std::borrow::Cow;
use std::fmt;
use std::marker::PhantomData;
use std::ops::Deref;

use crate::storage;

fn drain_seq<'de, A: SeqAccess<'de>>(mut seq: A) -> Result<(), A::Error> {
    while seq.next_element::<IgnoredAny>()?.is_some() {}
    Ok(())
}

fn drain_map<'de, A: MapAccess<'de>>(mut map: A) -> Result<(), A::Error> {
    while map.next_entry::<IgnoredAny, IgnoredAny>()?.is_some() {}
    Ok(())
}

enum Scalar {
    Signed(i64),
    Unsigned(u64),
    Float(f64),
    Bool(bool),
    Other,
}

impl<'de> Deserialize<'de> for Scalar {
    fn deserialize<D: Deserializer<'de>>(deserializer: D) -> Result<Self, D::Error> {
        struct Lenient;
        impl<'de> Visitor<'de> for Lenient {
            type Value = Scalar;
            fn expecting(&self, formatter: &mut fmt::Formatter) -> fmt::Result {
                formatter.write_str("a scalar")
            }
            fn visit_bool<E>(self, value: bool) -> Result<Scalar, E> {
                Ok(Scalar::Bool(value))
            }
            fn visit_i64<E>(self, value: i64) -> Result<Scalar, E> {
                Ok(Scalar::Signed(value))
            }
            fn visit_u64<E>(self, value: u64) -> Result<Scalar, E> {
                Ok(Scalar::Unsigned(value))
            }
            fn visit_f64<E>(self, value: f64) -> Result<Scalar, E> {
                Ok(Scalar::Float(value))
            }
            fn visit_str<E>(self, _: &str) -> Result<Scalar, E> {
                Ok(Scalar::Other)
            }
            fn visit_unit<E>(self) -> Result<Scalar, E> {
                Ok(Scalar::Other)
            }
            fn visit_seq<A: SeqAccess<'de>>(self, seq: A) -> Result<Scalar, A::Error> {
                drain_seq(seq).map(|()| Scalar::Other)
            }
            fn visit_map<A: MapAccess<'de>>(self, map: A) -> Result<Scalar, A::Error> {
                drain_map(map).map(|()| Scalar::Other)
            }
        }
        deserializer.deserialize_any(Lenient)
    }
}

#[derive(Default, Clone, Copy)]
pub struct Int(pub Option<i64>);

impl Int {
    pub fn value(self) -> i64 {
        self.0.unwrap_or(0)
    }
}

impl<'de> Deserialize<'de> for Int {
    fn deserialize<D: Deserializer<'de>>(deserializer: D) -> Result<Self, D::Error> {
        Ok(Int(match Scalar::deserialize(deserializer)? {
            Scalar::Signed(value) => Some(value),
            Scalar::Unsigned(value) => i64::try_from(value).ok(),
            _ => None,
        }))
    }
}

#[derive(Default, Clone, Copy)]
pub struct Num(pub Option<f64>);

impl<'de> Deserialize<'de> for Num {
    fn deserialize<D: Deserializer<'de>>(deserializer: D) -> Result<Self, D::Error> {
        Ok(Num(match Scalar::deserialize(deserializer)? {
            Scalar::Signed(value) => Some(value as f64),
            Scalar::Unsigned(value) => Some(value as f64),
            Scalar::Float(value) => Some(value),
            _ => None,
        }))
    }
}

#[derive(Default, Clone, Copy)]
pub struct Flag(pub Option<bool>);

impl<'de> Deserialize<'de> for Flag {
    fn deserialize<D: Deserializer<'de>>(deserializer: D) -> Result<Self, D::Error> {
        Ok(Flag(match Scalar::deserialize(deserializer)? {
            Scalar::Bool(value) => Some(value),
            _ => None,
        }))
    }
}

#[derive(Default, Clone)]
pub struct Text<'a>(Option<Cow<'a, str>>);

impl Text<'_> {
    pub fn get(&self) -> Option<&str> {
        self.0.as_deref()
    }
}

impl<'de: 'a, 'a> Deserialize<'de> for Text<'a> {
    fn deserialize<D: Deserializer<'de>>(deserializer: D) -> Result<Self, D::Error> {
        struct Lenient<'a>(PhantomData<&'a ()>);
        impl<'de: 'a, 'a> Visitor<'de> for Lenient<'a> {
            type Value = Text<'a>;
            fn expecting(&self, formatter: &mut fmt::Formatter) -> fmt::Result {
                formatter.write_str("a string")
            }
            fn visit_borrowed_str<E>(self, value: &'de str) -> Result<Self::Value, E> {
                Ok(Text(Some(Cow::Borrowed(value))))
            }
            fn visit_str<E>(self, value: &str) -> Result<Self::Value, E> {
                Ok(Text(Some(Cow::Owned(value.to_string()))))
            }
            fn visit_string<E>(self, value: String) -> Result<Self::Value, E> {
                Ok(Text(Some(Cow::Owned(value))))
            }
            fn visit_bool<E>(self, _: bool) -> Result<Self::Value, E> {
                Ok(Text(None))
            }
            fn visit_i64<E>(self, _: i64) -> Result<Self::Value, E> {
                Ok(Text(None))
            }
            fn visit_u64<E>(self, _: u64) -> Result<Self::Value, E> {
                Ok(Text(None))
            }
            fn visit_f64<E>(self, _: f64) -> Result<Self::Value, E> {
                Ok(Text(None))
            }
            fn visit_unit<E>(self) -> Result<Self::Value, E> {
                Ok(Text(None))
            }
            fn visit_seq<A: SeqAccess<'de>>(self, seq: A) -> Result<Self::Value, A::Error> {
                drain_seq(seq).map(|()| Text(None))
            }
            fn visit_map<A: MapAccess<'de>>(self, map: A) -> Result<Self::Value, A::Error> {
                drain_map(map).map(|()| Text(None))
            }
        }
        deserializer.deserialize_any(Lenient(PhantomData))
    }
}

#[derive(Default, Clone, Copy)]
pub struct Spot(Option<(f64, f64)>);

impl Spot {
    pub fn get(self) -> Option<(f64, f64)> {
        self.0
    }
}

impl<'de> Deserialize<'de> for Spot {
    fn deserialize<D: Deserializer<'de>>(deserializer: D) -> Result<Self, D::Error> {
        struct Lenient;
        impl<'de> Visitor<'de> for Lenient {
            type Value = Option<(f64, f64)>;
            fn expecting(&self, formatter: &mut fmt::Formatter) -> fmt::Result {
                formatter.write_str("a location")
            }
            fn visit_bool<E>(self, _: bool) -> Result<Self::Value, E> {
                Ok(None)
            }
            fn visit_i64<E>(self, _: i64) -> Result<Self::Value, E> {
                Ok(None)
            }
            fn visit_u64<E>(self, _: u64) -> Result<Self::Value, E> {
                Ok(None)
            }
            fn visit_f64<E>(self, _: f64) -> Result<Self::Value, E> {
                Ok(None)
            }
            fn visit_str<E>(self, _: &str) -> Result<Self::Value, E> {
                Ok(None)
            }
            fn visit_unit<E>(self) -> Result<Self::Value, E> {
                Ok(None)
            }
            fn visit_seq<A: SeqAccess<'de>>(self, seq: A) -> Result<Self::Value, A::Error> {
                drain_seq(seq).map(|()| None)
            }
            fn visit_map<A: MapAccess<'de>>(self, mut map: A) -> Result<Self::Value, A::Error> {
                let (mut x, mut y) = (Num(None), Num(None));
                while let Some(key) = map.next_key::<Cow<'de, str>>()? {
                    match key.as_ref() {
                        "x" => x = map.next_value()?,
                        "y" => y = map.next_value()?,
                        _ => {
                            map.next_value::<IgnoredAny>()?;
                        }
                    }
                }
                Ok(x.0.zip(y.0))
            }
        }
        deserializer.deserialize_any(Lenient).map(Spot)
    }
}

pub struct List<T>(Vec<T>);

impl<T> Default for List<T> {
    fn default() -> Self {
        List(Vec::new())
    }
}

impl<T> Deref for List<T> {
    type Target = [T];
    fn deref(&self) -> &[T] {
        &self.0
    }
}

impl<'de, T: Deserialize<'de>> Deserialize<'de> for List<T> {
    fn deserialize<D: Deserializer<'de>>(deserializer: D) -> Result<Self, D::Error> {
        Ok(List(Option::<Vec<T>>::deserialize(deserializer)?.unwrap_or_default()))
    }
}

#[derive(Default, Deserialize)]
#[serde(default)]
pub struct Named<'a> {
    #[serde(borrow)]
    pub id: Text<'a>,
    #[serde(borrow)]
    pub name: Text<'a>,
}

#[derive(Default, Deserialize)]
#[serde(default)]
pub struct Metadata<'a> {
    #[serde(borrow)]
    pub map: Named<'a>,
}

#[derive(Default, Deserialize)]
#[serde(default)]
pub struct Customization<'a> {
    #[serde(borrow)]
    pub card: Text<'a>,
}

#[derive(Default, Deserialize)]
#[serde(default)]
pub struct Player<'a> {
    #[serde(borrow)]
    pub puuid: Text<'a>,
    #[serde(borrow)]
    pub name: Text<'a>,
    #[serde(borrow)]
    pub tag: Text<'a>,
    #[serde(borrow)]
    pub team_id: Text<'a>,
    #[serde(borrow)]
    pub agent: Named<'a>,
    #[serde(borrow)]
    pub customization: Customization<'a>,
}

#[derive(Default, Deserialize)]
#[serde(default)]
pub struct Team<'a> {
    #[serde(borrow)]
    pub team_id: Text<'a>,
    pub won: Flag,
}

#[derive(Default, Deserialize)]
#[serde(default)]
pub struct Person<'a> {
    #[serde(borrow)]
    pub puuid: Text<'a>,
    #[serde(borrow)]
    pub name: Text<'a>,
    #[serde(borrow)]
    pub team: Text<'a>,
}

#[derive(Default, Deserialize)]
#[serde(default)]
pub struct Plant<'a> {
    pub round_time_in_ms: Int,
    #[serde(borrow)]
    pub site: Text<'a>,
    pub location: Spot,
}

#[derive(Default, Deserialize)]
#[serde(default)]
pub struct Economy<'a> {
    #[serde(borrow)]
    pub weapon: Named<'a>,
}

#[derive(Default, Deserialize)]
#[serde(default)]
pub struct Shots {
    pub headshots: Int,
    pub bodyshots: Int,
    pub legshots: Int,
}

#[derive(Default, Deserialize)]
#[serde(default)]
pub struct RoundStat<'a> {
    #[serde(borrow)]
    pub player: Person<'a>,
    #[serde(borrow)]
    pub economy: Economy<'a>,
    pub stats: Shots,
}

#[derive(Default, Deserialize)]
#[serde(default)]
pub struct Round<'a> {
    #[serde(borrow)]
    pub winning_team: Text<'a>,
    #[serde(borrow)]
    pub winning_team_role: Text<'a>,
    #[serde(borrow)]
    pub plant: Option<Plant<'a>>,
    #[serde(borrow)]
    pub stats: List<RoundStat<'a>>,
}

#[derive(Default, Deserialize)]
#[serde(default)]
pub struct KillWeapon<'a> {
    #[serde(borrow)]
    pub id: Text<'a>,
    #[serde(borrow)]
    pub name: Text<'a>,
    #[serde(rename = "type", borrow)]
    pub kind: Text<'a>,
}

#[derive(Default, Deserialize)]
#[serde(default)]
pub struct Located<'a> {
    #[serde(borrow)]
    pub player: Person<'a>,
    pub location: Spot,
}

#[derive(Default, Deserialize)]
#[serde(default)]
pub struct Kill<'a> {
    pub round: Int,
    pub time_in_round_in_ms: Int,
    #[serde(borrow)]
    pub killer: Person<'a>,
    #[serde(borrow)]
    pub victim: Person<'a>,
    #[serde(borrow)]
    pub weapon: KillWeapon<'a>,
    pub location: Spot,
    #[serde(borrow)]
    pub player_locations: List<Located<'a>>,
}

impl Kill<'_> {
    pub fn round(&self) -> i64 {
        self.round.value()
    }

    pub fn time(&self) -> i64 {
        self.time_in_round_in_ms.value()
    }

    pub fn location_of(&self, puuid: &str) -> Option<(f64, f64)> {
        self.player_locations.iter().find(|entry| entry.player.puuid.get() == Some(puuid)).and_then(|entry| entry.location.get())
    }
}

#[derive(Default, Deserialize)]
#[serde(default)]
pub struct Game<'a> {
    #[serde(borrow)]
    pub metadata: Metadata<'a>,
    #[serde(borrow)]
    pub players: List<Player<'a>>,
    #[serde(borrow)]
    pub teams: List<Team<'a>>,
    #[serde(borrow)]
    pub rounds: List<Round<'a>>,
    #[serde(borrow)]
    pub kills: List<Kill<'a>>,
}

impl<'a> Game<'a> {
    pub fn parse(json: &'a [u8]) -> Option<Self> {
        serde_json::from_slice(json).ok()
    }

    pub fn player(&self, puuid: &str) -> Option<&Player<'a>> {
        self.players.iter().find(|player| player.puuid.get() == Some(puuid))
    }

    pub fn attacks_first(&self, team: &str) -> bool {
        let Some(first) = self.rounds.first() else {
            return true;
        };
        let winner_is_mine = first.winning_team.get() == Some(team);
        let role_attacker = first.winning_team_role.get() == Some("Attacker");
        winner_is_mine == role_attacker
    }
}

pub fn with_game<T>(raw: &[u8], read: impl FnOnce(&Game) -> T) -> Option<T> {
    let json = storage::inflate(raw)?;
    let game = Game::parse(&json)?;
    Some(read(&game))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reads_fields_like_the_json_accessors() {
        let json = br#"{
            "players": [{ "puuid": "a\"b", "team_id": 3, "agent": { "id": "jett" } }],
            "teams": [{ "team_id": "Red", "won": "yes" }],
            "rounds": [{ "winning_team": "Red", "plant": null, "stats": null }, { "plant": { "round_time_in_ms": 1.5, "location": { "x": 1, "y": -2.5 } } }],
            "kills": [{ "round": 18446744073709551615, "time_in_round_in_ms": -3, "location": [1, 2],
                        "player_locations": [{ "player": { "puuid": "k" }, "location": { "x": 4, "y": 5, "z": 0 } }] }],
            "extra": { "nested": [1, { "a": null }] }
        }"#;
        let game = Game::parse(json).expect("parsed");
        assert_eq!(game.players[0].puuid.get(), Some("a\"b"));
        assert_eq!(game.players[0].team_id.get(), None);
        assert_eq!(game.teams[0].won.0, None);
        assert!(game.rounds[0].plant.is_none() && game.rounds[0].stats.is_empty());
        let plant = game.rounds[1].plant.as_ref().unwrap();
        assert_eq!(plant.round_time_in_ms.0, None);
        assert_eq!(plant.location.get(), Some((1.0, -2.5)));
        let kill = &game.kills[0];
        assert_eq!((kill.round(), kill.time()), (0, -3));
        assert_eq!(kill.location.get(), None);
        assert_eq!(kill.location_of("k"), Some((4.0, 5.0)));
        assert!(game.attacks_first("Blue") != game.attacks_first("Red") || game.rounds[0].winning_team_role.get().is_none());
    }
}
