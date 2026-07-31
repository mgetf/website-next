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
    assert_eq!(
        ops, 9,
        "create-match, ban-map, submit-score, schedule, status, comms, reschedules"
    );
    let structs = file
        .items
        .iter()
        .filter(|i| matches!(i, Item::Struct(_)))
        .count();
    assert_eq!(structs, 13, "4 pstate schemas + 9 event structs");
    let pstates = file
        .items
        .iter()
        .filter(|i| matches!(i, Item::PState(_)))
        .count();
    assert_eq!(pstates, 8);
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
    // Hop-free ban-map stays a compact deframaop; hopping ops inline so
    // their pstate references survive the partition hops.
    assert!(clj.contains("(deframaop ban-map>"));
    assert!(
        !clj.contains("(deframaop create-match>"),
        "hopping op must inline: {clj}"
    );
    assert!(clj.contains("(case> \"create-match\")"));
    assert!(
        clj.contains("\"unknown-type\""),
        "switch dispatch should ack unknown event types"
    );
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
    // The ban-map deframaop: event-validation guard + collapsed fail guard.
    let ban_body = clj
        .split("(deframaop ban-map>")
        .nth(1)
        .and_then(|rest| rest.split("(defn ").next())
        .expect("ban-map deframaop");
    assert_eq!(
        ban_body.matches("<<if").count(),
        2,
        "unexpected <<if count in ban-map op: {ban_body}"
    );
    assert!(
        clj.contains("__ban-map-event-error"),
        "typed event should generate a validator"
    );
    // Optional JSON numbers are Object + long-or-zero in ops (tests omit
    // fields); required String fields still get an event validator.
    assert!(
        clj.contains("long-or-zero"),
        "optional numeric event fields should coerce via long-or-zero"
    );
}
