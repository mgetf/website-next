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
    assert_eq!(structs, 3);
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
}
