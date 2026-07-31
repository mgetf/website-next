use rama_syntax::ast::Item;
use rama_syntax::{analyze, emit_clojure, parse};

fn fixture(name: &str) -> String {
    let path = format!("{}/fixtures/{name}", env!("CARGO_MANIFEST_DIR"));
    std::fs::read_to_string(path).expect("fixture")
}

#[test]
fn parses_match_v2() {
    let src = fixture("match_v2.rama");
    let file = parse(&src).unwrap_or_else(|e| {
        for d in &e.diagnostics {
            eprintln!("{}", d.render(&src));
        }
        panic!("parse failed");
    });

    assert!(matches!(file.items[0], Item::Module(_)));
    let ops = file
        .items
        .iter()
        .filter(|i| matches!(i, Item::Op(_)))
        .count();
    assert_eq!(ops, 3, "create-match, ban-map, submit-score");
    let structs = file
        .items
        .iter()
        .filter(|i| matches!(i, Item::Struct(_)))
        .count();
    assert_eq!(structs, 6, "3 pstate schemas + 3 event structs");
    let pstates = file
        .items
        .iter()
        .filter(|i| matches!(i, Item::PState(_)))
        .count();
    assert_eq!(pstates, 4);
}

#[test]
fn typechecks_match_v2() {
    let src = fixture("match_v2.rama");
    let (_file, result) = analyze(&src).expect("parse");
    assert!(
        result.ok(),
        "unexpected: {:?}",
        result
            .diagnostics
            .iter()
            .map(|d| &d.message)
            .collect::<Vec<_>>()
    );
}

#[test]
fn emits_match_v2_clojure() {
    let src = fixture("match_v2.rama");
    let file = parse(&src).expect("parse");
    let clj = emit_clojure(&file);
    assert!(clj.contains("(deframaop create-match>"));
    assert!(clj.contains("(local-select>"));
    assert!(clj.contains("(local-transform>"));
    assert!(clj.contains("(ack-return>"));
    assert!(clj.contains("(|hash"));
    assert!(clj.contains("AFTER-ELEM"));
    assert!(
        clj.contains("fixed-keys-schema"),
        "struct should lower to fixed-keys-schema"
    );
    assert!(clj.contains("identity"), "fail chains use identity+cond");
    assert!(clj.contains("cond"), "fail chains use identity+cond");
    assert!(clj.contains("*__err"), "flat fail should bind *__err");
    assert!(clj.contains("else>"), "success path under else>");
    // ban-map: one <<if guards the event validation, one collapses 3 fails.
    let ban = clj
        .split("deframaop")
        .find(|s| s.contains("ban-map>"))
        .expect("ban-map op");
    let ban_body = ban.split("deframaop").next().unwrap_or(ban);
    assert_eq!(
        ban_body.matches("<<if").count(),
        2,
        "ban-map should have event-guard + fail-collapse <<ifs: {ban_body}"
    );
    assert!(
        clj.contains("__ban-map-event-error"),
        "typed event should generate a validator"
    );
    assert!(
        clj.contains("__rama_coerce_longs"),
        "Long event fields should generate coercion"
    );
}
