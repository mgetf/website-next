use phoron_core::deserializer::Deserializer;
use phoron_core::model::access_flags::{ACC_PUBLIC, ACC_SUPER};
use phoron_core::model::constant_pool::tags::{CONSTANT_CLASS, CONSTANT_UTF8};
use phoron_core::model::constant_pool::types::CpInfo;
use phoron_core::model::ClassFile;
use phoron_core::rw::reader::Reader;
use phoron_core::rw::writer::Writer;
use phoron_core::serializer::Serializer;
use std::io::Cursor;

#[test]
fn phoron_serializes_minimal_classfile() {
    let class_name = b"RamaEdnSmoke".to_vec();
    let object_name = b"java/lang/Object".to_vec();
    let classfile = ClassFile {
        magic: 0xCAFEBABE,
        minor_version: 0,
        major_version: 52,
        constant_pool_count: 5,
        constant_pool: vec![
            None,
            Some(CpInfo::ConstantUtf8Info {
                tag: CONSTANT_UTF8,
                length: class_name.len() as u16,
                bytes: class_name,
            }),
            Some(CpInfo::ConstantClassInfo {
                tag: CONSTANT_CLASS,
                name_index: 1,
            }),
            Some(CpInfo::ConstantUtf8Info {
                tag: CONSTANT_UTF8,
                length: object_name.len() as u16,
                bytes: object_name,
            }),
            Some(CpInfo::ConstantClassInfo {
                tag: CONSTANT_CLASS,
                name_index: 3,
            }),
        ],
        access_flags: ACC_PUBLIC | ACC_SUPER,
        this_class: 2,
        super_class: 4,
        interfaces_count: 0,
        interfaces: Vec::new(),
        fields_count: 0,
        fields: Vec::new(),
        methods_count: 0,
        methods: Vec::new(),
        attributes_count: 0,
        attributes: Vec::new(),
    };

    let mut bytes = Vec::new();
    Serializer::new(Writer::new(&mut bytes))
        .serialize(&classfile)
        .expect("serialize minimal class");
    assert_eq!(&bytes[..4], &[0xCA, 0xFE, 0xBA, 0xBE]);
    let mut deserializer = Deserializer::new(Reader::new(Cursor::new(bytes)));
    let round_tripped = deserializer.deserialize().expect("deserialize class bytes");
    assert_eq!(round_tripped.this_class, 2);
    assert_eq!(round_tripped.super_class, 4);
}
