//! Minimal nREPL client and live Clojure/JVM oracle.
//!
//! nREPL uses a stream of bencoded dictionaries. Keeping the implementation
//! here avoids a second helper protocol/process: the connected runtime is the
//! type oracle, observation source, and future probe endpoint.

use std::collections::{BTreeMap, HashMap};
use std::fmt;
use std::io::{BufReader, Read, Write};
use std::net::{TcpStream, ToSocketAddrs};
use std::sync::Mutex;
use std::time::Duration;

use crate::types::TypeOracle;

#[derive(Debug)]
pub enum Error {
    Io(std::io::Error),
    Protocol(String),
    Eval(String),
}

impl fmt::Display for Error {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Error::Io(error) => write!(f, "nREPL I/O error: {error}"),
            Error::Protocol(message) => write!(f, "nREPL protocol error: {message}"),
            Error::Eval(message) => write!(f, "nREPL evaluation error: {message}"),
        }
    }
}

impl std::error::Error for Error {}

impl From<std::io::Error> for Error {
    fn from(value: std::io::Error) -> Self {
        Self::Io(value)
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
enum BValue {
    Bytes(Vec<u8>),
    Int(i64),
    List(Vec<BValue>),
    Dict(BTreeMap<Vec<u8>, BValue>),
}

impl BValue {
    fn string(value: impl Into<Vec<u8>>) -> Self {
        Self::Bytes(value.into())
    }

    fn as_text(&self) -> Option<String> {
        match self {
            Self::Bytes(bytes) => String::from_utf8(bytes.clone()).ok(),
            _ => None,
        }
    }
}

fn encode(value: &BValue, out: &mut Vec<u8>) {
    match value {
        BValue::Bytes(bytes) => {
            out.extend_from_slice(bytes.len().to_string().as_bytes());
            out.push(b':');
            out.extend_from_slice(bytes);
        }
        BValue::Int(value) => {
            out.push(b'i');
            out.extend_from_slice(value.to_string().as_bytes());
            out.push(b'e');
        }
        BValue::List(values) => {
            out.push(b'l');
            for value in values {
                encode(value, out);
            }
            out.push(b'e');
        }
        BValue::Dict(entries) => {
            out.push(b'd');
            for (key, value) in entries {
                encode(&BValue::Bytes(key.clone()), out);
                encode(value, out);
            }
            out.push(b'e');
        }
    }
}

struct Decoder<R> {
    reader: R,
    pushed: Option<u8>,
}

impl<R: Read> Decoder<R> {
    fn new(reader: R) -> Self {
        Self {
            reader,
            pushed: None,
        }
    }

    fn byte(&mut self) -> Result<u8, Error> {
        if let Some(byte) = self.pushed.take() {
            return Ok(byte);
        }
        let mut byte = [0u8; 1];
        self.reader.read_exact(&mut byte)?;
        Ok(byte[0])
    }

    fn unread(&mut self, byte: u8) {
        debug_assert!(self.pushed.is_none());
        self.pushed = Some(byte);
    }

    fn value(&mut self) -> Result<BValue, Error> {
        match self.byte()? {
            b'i' => Ok(BValue::Int(self.number_until(b'e')?)),
            b'l' => {
                let mut values = Vec::new();
                loop {
                    let byte = self.byte()?;
                    if byte == b'e' {
                        break;
                    }
                    self.unread(byte);
                    values.push(self.value()?);
                }
                Ok(BValue::List(values))
            }
            b'd' => {
                let mut entries = BTreeMap::new();
                loop {
                    let byte = self.byte()?;
                    if byte == b'e' {
                        break;
                    }
                    self.unread(byte);
                    let BValue::Bytes(key) = self.value()? else {
                        return Err(Error::Protocol("dictionary key is not bytes".into()));
                    };
                    entries.insert(key, self.value()?);
                }
                Ok(BValue::Dict(entries))
            }
            first if first.is_ascii_digit() => {
                self.unread(first);
                let length = self.usize_until(b':')?;
                let mut bytes = vec![0; length];
                self.reader.read_exact(&mut bytes)?;
                Ok(BValue::Bytes(bytes))
            }
            byte => Err(Error::Protocol(format!(
                "unexpected bencode marker 0x{byte:02x}"
            ))),
        }
    }

    fn usize_until(&mut self, terminator: u8) -> Result<usize, Error> {
        let text = self.text_until(terminator)?;
        text.parse()
            .map_err(|_| Error::Protocol(format!("invalid bencode length `{text}`")))
    }

    fn number_until(&mut self, terminator: u8) -> Result<i64, Error> {
        let text = self.text_until(terminator)?;
        text.parse()
            .map_err(|_| Error::Protocol(format!("invalid bencode integer `{text}`")))
    }

    fn text_until(&mut self, terminator: u8) -> Result<String, Error> {
        let mut bytes = Vec::new();
        loop {
            let byte = self.byte()?;
            if byte == terminator {
                break;
            }
            bytes.push(byte);
        }
        String::from_utf8(bytes).map_err(|_| Error::Protocol("non-UTF8 bencode number".into()))
    }
}

#[derive(Debug, Clone, Default)]
pub struct EvalResponse {
    pub values: Vec<String>,
    pub out: String,
    pub err: String,
}

pub struct Client {
    reader: Decoder<BufReader<TcpStream>>,
    writer: TcpStream,
    next_id: u64,
}

impl Client {
    pub fn connect(address: impl ToSocketAddrs) -> Result<Self, Error> {
        let stream = TcpStream::connect(address)?;
        stream.set_read_timeout(Some(Duration::from_secs(30)))?;
        stream.set_write_timeout(Some(Duration::from_secs(30)))?;
        let writer = stream.try_clone()?;
        Ok(Self {
            reader: Decoder::new(BufReader::new(stream)),
            writer,
            next_id: 1,
        })
    }

    pub fn eval(&mut self, code: &str) -> Result<EvalResponse, Error> {
        let id = self.next_id.to_string();
        self.next_id += 1;
        let request = BValue::Dict(BTreeMap::from([
            (b"code".to_vec(), BValue::string(code.as_bytes())),
            (b"id".to_vec(), BValue::string(id.as_bytes())),
            (b"op".to_vec(), BValue::string(b"eval".as_slice())),
        ]));
        let mut bytes = Vec::new();
        encode(&request, &mut bytes);
        self.writer.write_all(&bytes)?;
        self.writer.flush()?;

        let mut response = EvalResponse::default();
        loop {
            let BValue::Dict(message) = self.reader.value()? else {
                return Err(Error::Protocol("nREPL response is not a dictionary".into()));
            };
            if text_field(&message, b"id").as_deref() != Some(id.as_str()) {
                continue;
            }
            if let Some(value) = text_field(&message, b"value") {
                response.values.push(value);
            }
            if let Some(out) = text_field(&message, b"out") {
                response.out.push_str(&out);
            }
            if let Some(err) = text_field(&message, b"err") {
                response.err.push_str(&err);
            }
            if let Some(ex) = text_field(&message, b"ex") {
                response.err.push_str(&ex);
            }
            if status_contains(&message, "done") {
                break;
            }
        }
        if response.err.is_empty() {
            Ok(response)
        } else {
            Err(Error::Eval(response.err))
        }
    }
}

fn text_field(message: &BTreeMap<Vec<u8>, BValue>, key: &[u8]) -> Option<String> {
    message.get(key).and_then(BValue::as_text)
}

fn status_contains(message: &BTreeMap<Vec<u8>, BValue>, expected: &str) -> bool {
    match message.get(b"status".as_slice()) {
        Some(BValue::List(statuses)) => statuses
            .iter()
            .filter_map(BValue::as_text)
            .any(|status| status == expected),
        Some(BValue::Bytes(status)) => status == expected.as_bytes(),
        _ => false,
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Observation {
    pub var_name: String,
    pub argument_types: Vec<String>,
    pub return_type: String,
}

impl Observation {
    pub fn extern_declaration(&self) -> String {
        let params = self
            .argument_types
            .iter()
            .enumerate()
            .map(|(index, ty)| format!("arg{index}: {ty}"))
            .collect::<Vec<_>>()
            .join(", ");
        format!(
            "extern {} = {}({params}) -> {}",
            source_var_name(&self.var_name),
            self.var_name,
            self.return_type
        )
    }
}

pub fn pin_observation(source: &str, observation: &Observation) -> (String, bool) {
    let declaration = observation.extern_declaration();
    if source.lines().any(|line| line.trim() == declaration) {
        return (source.to_string(), false);
    }
    let mut output = source.to_string();
    if !output.ends_with('\n') {
        output.push('\n');
    }
    output.push_str(&format!(
        "\n// observed from `{}` through nREPL; concrete sample, safe to generalize\n{}\n",
        observation.var_name, declaration
    ));
    (output, true)
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct VarInfo {
    pub qualified_name: String,
    pub arities: Vec<Vec<String>>,
    pub has_varargs: bool,
}

impl VarInfo {
    pub fn extern_suggestions(&self) -> Vec<String> {
        let name = source_var_name(&self.qualified_name);
        let mut suggestions = self
            .arities
            .iter()
            .map(|params| {
                format!(
                    "extern {} = {}({}) -> Unknown",
                    name,
                    self.qualified_name,
                    params
                        .iter()
                        .map(|param| format!("{}: Unknown", sanitize_param(param)))
                        .collect::<Vec<_>>()
                        .join(", ")
                )
            })
            .collect::<Vec<_>>();
        if self.has_varargs {
            suggestions.push(format!(
                "// `{}` has a variadic arity; observe concrete calls before pinning it",
                self.qualified_name
            ));
        }
        suggestions
    }
}

pub struct LiveOracle {
    client: Mutex<Client>,
    assignability: Mutex<HashMap<(String, String), bool>>,
    vars: Mutex<HashMap<String, Option<VarInfo>>>,
}

impl LiveOracle {
    pub fn connect(address: impl ToSocketAddrs) -> Result<Self, Error> {
        Ok(Self {
            client: Mutex::new(Client::connect(address)?),
            assignability: Mutex::new(HashMap::new()),
            vars: Mutex::new(HashMap::new()),
        })
    }

    pub fn var_info(&self, name: &str) -> Result<Option<VarInfo>, Error> {
        if let Some(cached) = self.vars.lock().unwrap().get(name).cloned() {
            return Ok(cached);
        }
        let code = var_info_code(name);
        let response = self.client.lock().unwrap().eval(&code)?;
        let Some(value) = response.values.last() else {
            return Ok(None);
        };
        let parsed = parse_var_info(value)?;
        self.vars
            .lock()
            .unwrap()
            .insert(name.to_string(), parsed.clone());
        Ok(parsed)
    }

    pub fn observe_call(&self, var: &str, args_edn: &str) -> Result<Observation, Error> {
        let code = observe_code(var, args_edn);
        let response = self.client.lock().unwrap().eval(&code)?;
        let value = response
            .values
            .last()
            .ok_or_else(|| Error::Protocol("observe-call returned no value".into()))?;
        parse_observation(var, value)
    }

    fn assignable(&self, actual: &str, expected: &str) -> Result<bool, Error> {
        let key = (actual.to_string(), expected.to_string());
        if let Some(cached) = self.assignability.lock().unwrap().get(&key) {
            return Ok(*cached);
        }
        let code = format!(
            "(let [loader (.getContextClassLoader (Thread/currentThread)) \
             actual (Class/forName {} false loader) \
             expected (Class/forName {} false loader)] \
             (.isAssignableFrom expected actual))",
            clj_string(actual),
            clj_string(expected)
        );
        let response = self.client.lock().unwrap().eval(&code)?;
        let result = match response.values.last().map(String::as_str) {
            Some("true") => true,
            Some("false") => false,
            other => Err(Error::Protocol(format!(
                "assignability query returned {other:?}"
            )))?,
        };
        self.assignability.lock().unwrap().insert(key, result);
        Ok(result)
    }
}

impl TypeOracle for LiveOracle {
    fn is_assignable(&self, actual: &str, expected: &str) -> Option<bool> {
        self.assignable(actual, expected).ok()
    }

    fn extern_suggestions(&self, name: &str) -> Vec<String> {
        self.var_info(name)
            .ok()
            .flatten()
            .map_or_else(Vec::new, |info| info.extern_suggestions())
    }
}

fn var_info_code(name: &str) -> String {
    format!(
        "(let [requested (symbol {}) \
               v (if (namespace requested) \
                   (requiring-resolve requested) \
                   (or (ns-resolve *ns* requested) \
                       (ns-resolve 'clojure.core requested)))] \
          (if (nil? v) \
            \"NOT_FOUND\" \
            (let [m (meta v) \
                  q (str (ns-name (:ns m)) \"/\" (:name m)) \
                  rows (mapv \
                         (fn [args] \
                           (let [parts (vec (map str args)) \
                                 amp (.indexOf parts \"&\") \
                                 fixed (if (neg? amp) (count parts) amp)] \
                             (str fixed \"\\t\" \
                                  (if (neg? amp) \"0\" \"1\") \"\\t\" \
                                  (clojure.string/join \",\" (take fixed parts))))) \
                         (:arglists m))] \
              (str \"FOUND\\t\" q \"\\n\" \
                   (clojure.string/join \"\\n\" rows)))))",
        clj_string(name)
    )
}

fn observe_code(var: &str, args_edn: &str) -> String {
    format!(
        "(letfn [(join-types [types] \
                    (let [types (vec (distinct (sort types)))] \
                      (cond (empty? types) \"Never\" \
                            (= 1 (count types)) (first types) \
                            :else (clojure.string/join \" | \" types)))) \
                  (describe [value] \
                    (cond \
                      (nil? value) \"Nil\" \
                      (string? value) \"String\" \
                      (instance? java.lang.Long value) \"Long\" \
                      (instance? java.lang.Integer value) \"Int\" \
                      (instance? java.lang.Boolean value) \"Boolean\" \
                      (map? value) (str \"java.util.Map<\" \
                        (join-types (map describe (keys value))) \", \" \
                        (join-types (map describe (vals value))) \">\") \
                      (set? value) (str \"java.util.Set<\" \
                        (join-types (map describe value)) \">\") \
                      (or (sequential? value) (instance? java.util.List value)) \
                        (str \"java.util.List<\" \
                          (join-types (map describe value)) \">\") \
                      :else (.getName (class value))))] \
          (let [requested (symbol {}) \
                f (if (namespace requested) \
                    (requiring-resolve requested) \
                    (or (ns-resolve *ns* requested) \
                        (ns-resolve 'clojure.core requested))) \
                args {}] \
            (when-not f (throw (ex-info \"Var not found\" {{:var (str requested)}}))) \
            (when-not (sequential? args) \
              (throw (ex-info \"--args must be an EDN sequential value\" {{:args args}}))) \
            (let [result (apply f args)] \
              (str \"OK\\n\" \
                   (clojure.string/join \"\\t\" (map describe args)) \"\\n\" \
                   (describe result)))))",
        clj_string(var),
        args_edn
    )
}

fn parse_var_info(value: &str) -> Result<Option<VarInfo>, Error> {
    if value == "\"NOT_FOUND\"" || value == "NOT_FOUND" {
        return Ok(None);
    }
    let value = unquote_nrepl_value(value);
    let mut lines = value.lines();
    let header = lines
        .next()
        .ok_or_else(|| Error::Protocol("empty Var info".into()))?;
    let Some(qualified_name) = header.strip_prefix("FOUND\t") else {
        return Err(Error::Protocol(format!(
            "invalid Var info header `{header}`"
        )));
    };
    let mut arities = Vec::new();
    let mut has_varargs = false;
    for line in lines {
        let mut fields = line.splitn(3, '\t');
        let fixed: usize = fields
            .next()
            .unwrap_or("0")
            .parse()
            .map_err(|_| Error::Protocol(format!("invalid arity `{line}`")))?;
        has_varargs |= fields.next() == Some("1");
        let names = fields
            .next()
            .unwrap_or("")
            .split(',')
            .filter(|name| !name.is_empty())
            .map(str::to_string)
            .take(fixed)
            .collect();
        arities.push(names);
    }
    Ok(Some(VarInfo {
        qualified_name: qualified_name.to_string(),
        arities,
        has_varargs,
    }))
}

fn parse_observation(var: &str, value: &str) -> Result<Observation, Error> {
    let value = unquote_nrepl_value(value);
    let mut lines = value.lines();
    if lines.next() != Some("OK") {
        return Err(Error::Protocol(format!(
            "invalid observe-call result `{value}`"
        )));
    }
    let arguments = lines.next().unwrap_or("");
    let return_type = lines
        .next()
        .ok_or_else(|| Error::Protocol("observe-call omitted return type".into()))?;
    Ok(Observation {
        var_name: var.to_string(),
        argument_types: if arguments.is_empty() {
            Vec::new()
        } else {
            arguments.split('\t').map(str::to_string).collect()
        },
        return_type: return_type.to_string(),
    })
}

fn unquote_nrepl_value(value: &str) -> String {
    if value.starts_with('"') && value.ends_with('"') {
        let inner = &value[1..value.len() - 1];
        inner
            .replace("\\n", "\n")
            .replace("\\t", "\t")
            .replace("\\\"", "\"")
            .replace("\\\\", "\\")
    } else {
        value.to_string()
    }
}

fn source_var_name(name: &str) -> &str {
    name.rsplit('/').next().unwrap_or(name)
}

fn sanitize_param(name: &str) -> String {
    let sanitized: String = name
        .chars()
        .map(|character| {
            if character.is_ascii_alphanumeric() || matches!(character, '_' | '-' | '?') {
                character
            } else {
                '_'
            }
        })
        .collect();
    if sanitized.is_empty() || sanitized == "&" {
        "arg".into()
    } else {
        sanitized
    }
}

fn clj_string(value: &str) -> String {
    format!(
        "\"{}\"",
        value
            .replace('\\', "\\\\")
            .replace('"', "\\\"")
            .replace('\n', "\\n")
            .replace('\r', "\\r")
            .replace('\t', "\\t")
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::net::TcpListener;
    use std::thread;

    #[test]
    fn bencode_round_trips_nested_nrepl_message() {
        let value = BValue::Dict(BTreeMap::from([
            (b"id".to_vec(), BValue::string(b"1".as_slice())),
            (
                b"status".to_vec(),
                BValue::List(vec![BValue::string(b"done".as_slice())]),
            ),
            (b"value".to_vec(), BValue::string(b"true".as_slice())),
        ]));
        let mut encoded = Vec::new();
        encode(&value, &mut encoded);
        let mut decoder = Decoder::new(encoded.as_slice());
        assert_eq!(decoder.value().unwrap(), value);
    }

    #[test]
    fn client_collects_streamed_responses_until_done() {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let address = listener.local_addr().unwrap();
        let server = thread::spawn(move || {
            let (stream, _) = listener.accept().unwrap();
            let mut decoder = Decoder::new(BufReader::new(stream.try_clone().unwrap()));
            let BValue::Dict(request) = decoder.value().unwrap() else {
                panic!("request dictionary");
            };
            assert_eq!(text_field(&request, b"op").as_deref(), Some("eval"));
            assert_eq!(text_field(&request, b"code").as_deref(), Some("(+ 1 2)"));
            let id = text_field(&request, b"id").unwrap();
            let mut writer = stream;
            for message in [
                BValue::Dict(BTreeMap::from([
                    (b"id".to_vec(), BValue::string(id.as_bytes())),
                    (b"value".to_vec(), BValue::string(b"3".as_slice())),
                ])),
                BValue::Dict(BTreeMap::from([
                    (b"id".to_vec(), BValue::string(id.as_bytes())),
                    (
                        b"status".to_vec(),
                        BValue::List(vec![BValue::string(b"done".as_slice())]),
                    ),
                ])),
            ] {
                let mut bytes = Vec::new();
                encode(&message, &mut bytes);
                writer.write_all(&bytes).unwrap();
            }
        });
        let mut client = Client::connect(address).unwrap();
        let response = client.eval("(+ 1 2)").unwrap();
        assert_eq!(response.values, ["3"]);
        server.join().unwrap();
    }

    #[test]
    fn observation_becomes_source_extern() {
        let observation = Observation {
            var_name: "clojure.core/vec".into(),
            argument_types: vec!["java.util.List<Long>".into()],
            return_type: "java.util.List<Long>".into(),
        };
        assert_eq!(
            observation.extern_declaration(),
            "extern vec = clojure.core/vec(arg0: java.util.List<Long>) -> java.util.List<Long>"
        );
        let (source, changed) = pin_observation("module Demo\n", &observation);
        assert!(changed);
        assert!(source.contains("// observed from `clojure.core/vec`"));
        let (source_again, changed_again) = pin_observation(&source, &observation);
        assert!(!changed_again);
        assert_eq!(source_again, source);
    }

    #[test]
    fn parses_var_metadata_into_gradual_suggestions() {
        let info = parse_var_info(
            "\"FOUND\\tclojure.core/get\\n2\\t0\\tmap,key\\n3\\t0\\tmap,key,default\"",
        )
        .unwrap()
        .unwrap();
        assert_eq!(info.arities.len(), 2);
        assert_eq!(
            info.extern_suggestions()[0],
            "extern get = clojure.core/get(map: Unknown, key: Unknown) -> Unknown"
        );
    }
}
