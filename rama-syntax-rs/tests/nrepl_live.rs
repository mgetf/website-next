//! Live nREPL oracle conformance. Start nREPL on 7888, then run with `--ignored`.

use rama_syntax::analyze_with_oracle;
use rama_syntax::nrepl::LiveOracle;
use rama_syntax::types::TypeOracle;

#[test]
#[ignore = "requires a live nREPL at 127.0.0.1:7888"]
fn resolves_var_metadata_and_jvm_hierarchy() {
    let oracle = LiveOracle::connect("127.0.0.1:7888").expect("connect");
    let info = oracle
        .var_info("frequencies")
        .expect("query Var")
        .expect("frequencies Var");
    assert_eq!(info.qualified_name, "clojure.core/frequencies");
    assert!(info.arities.iter().any(|arity| arity.len() == 1));
    assert_eq!(
        oracle.is_assignable("java.util.ArrayList", "java.util.List"),
        Some(true)
    );
    assert_eq!(
        oracle.is_assignable("java.lang.String", "java.util.List"),
        Some(false)
    );

    let observation = oracle
        .observe_call("clojure.core/vec", "[[1 \"a\"]]")
        .expect("observe vec");
    assert_eq!(
        observation.extern_declaration(),
        "extern vec = clojure.core/vec(arg0: java.util.List<Long | String>) -> java.util.List<Long | String>"
    );

    let source = r#"
module LiveSuggestion
fn frequencies-of(value: String) -> Unknown {
  return frequencies(value)
}
"#;
    let (_, result) = analyze_with_oracle(source, &oracle).expect("live analysis");
    assert!(result.diagnostics.iter().any(|diagnostic| {
        diagnostic
            .message
            .contains("extern frequencies = clojure.core/frequencies(coll: Unknown) -> Unknown")
    }));
}
