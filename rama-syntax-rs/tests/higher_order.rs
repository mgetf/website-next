use rama_syntax::{analyze, emit_clojure, parse};

fn fixture() -> String {
    std::fs::read_to_string(concat!(
        env!("CARGO_MANIFEST_DIR"),
        "/fixtures/higher_order.rama"
    ))
    .expect("higher-order fixture")
}

#[test]
fn higher_order_fixture_typechecks() {
    let source = fixture();
    let (_, result) = analyze(&source).expect("parse");
    assert!(
        result.ok(),
        "unexpected diagnostics: {:#?}",
        result.diagnostics
    );
}

#[test]
fn emits_function_and_capability_contracts() {
    let source = fixture();
    let ast = parse(&source).expect("parse");
    let clojure = emit_clojure(&ast);
    assert!(clojure.contains("Fn<(java.lang.Long) -> java.lang.String>"));
    assert!(clojure.contains("(ifn?"));
    assert!(clojure.contains("(seqable?"));
    assert!(clojure.contains("clojure.lang.IReduceInit"));
    assert!(clojure.contains("invoke-checked argument `callback` return"));
}

#[test]
fn static_callback_mismatch_points_to_map_call() {
    let source = r#"
module BrokenHigher
fn string-size(value: String) -> Long { return count(value) }
fn bad(values: java.util.List<Long>) -> clojure.lang.LazySeq<Long> {
  return map(string-size, values)
}
"#;
    let (_, result) = analyze(source).expect("parse");
    let diagnostic = result
        .diagnostics
        .iter()
        .find(|diagnostic| diagnostic.message.contains("no `map` signature"))
        .expect("map mismatch");
    assert_eq!(diagnostic.span.slice(source), "map");
}
