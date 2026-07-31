use rama_syntax::ast::Item;
use rama_syntax::{analyze, emit_clojure, parse};

fn fixture() -> String {
    std::fs::read_to_string(concat!(
        env!("CARGO_MANIFEST_DIR"),
        "/fixtures/typed_fn.rama"
    ))
    .expect("typed fixture")
}

#[test]
fn parses_generic_externs_and_typed_functions() {
    let source = fixture();
    let file = parse(&source).expect("parse");
    assert_eq!(
        file.items
            .iter()
            .filter(|item| matches!(item, Item::Extern(_)))
            .count(),
        3
    );
    assert_eq!(
        file.items
            .iter()
            .filter(|item| matches!(item, Item::Fn(_)))
            .count(),
        5
    );
}

#[test]
fn typed_fixture_passes_static_checking() {
    let source = fixture();
    let (_, result) = analyze(&source).expect("parse and check");
    assert!(
        result.ok(),
        "unexpected diagnostics: {:#?}",
        result.diagnostics
    );
}

#[test]
fn emits_argument_return_and_extern_contracts() {
    let source = fixture();
    let file = parse(&source).expect("parse");
    let clojure = emit_clojure(&file);
    assert!(clojure.contains("(defn __rama_contract!"), "{clojure}");
    assert!(
        clojure.contains("(defn __rama_extern_identity"),
        "{clojure}"
    );
    assert!(clojure.contains("\"echo argument `value`\""), "{clojure}");
    assert!(clojure.contains("\"echo return\""), "{clojure}");
    assert!(clojure.contains("\"extern `str` return\""), "{clojure}");
    assert!(
        clojure.contains("java.util.List<java.lang.String>"),
        "{clojure}"
    );
    assert!(
        clojure.contains("\"explicit `as java.lang.String`\""),
        "{clojure}"
    );
}

#[test]
fn reports_precise_return_mismatch() {
    let source = r#"
module Broken
fn nope(value: Long) -> String {
  return value
}
"#;
    let (_, result) = analyze(source).expect("parse");
    let diagnostic = result
        .diagnostics
        .iter()
        .find(|diagnostic| diagnostic.message.contains("return type"))
        .expect("return mismatch");
    assert!(diagnostic.message.contains("java.lang.Long"));
    assert!(diagnostic.message.contains("java.lang.String"));
    assert_eq!(diagnostic.span.slice(source).trim(), "return value");
}

#[test]
fn parses_explicit_qualified_extern_target() {
    let source = r#"
module Qualified
extern vec = clojure.core/vec(value: Unknown) -> Unknown
"#;
    let file = parse(source).expect("parse");
    let Item::Extern(extern_decl) = &file.items[1] else {
        panic!("expected extern");
    };
    assert_eq!(
        extern_decl
            .target
            .as_ref()
            .map(|target| target.node.as_str()),
        Some("clojure.core/vec")
    );
}
