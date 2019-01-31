
enum ExprType {
    add = 0x00,
    subtract = 0x01,
    multiply = 0x02,
    divide = 0x03,
    modulo = 0x04,
    negate = 0x05,
    bitwise_or = 0x10,
    bitwise_and = 0x11,
    bitwise_xor = 0x12,
    bitwise_not = 0x13,
    and = 0x21,
    or = 0x22,
    not = 0x23,
    equal = 0x30,
    not_equal = 0x31,
    greater_than = 0x32,
    less_than = 0x33,
    greater_or_equal = 0x34,
    less_or_equal = 0x35,
    shift_left = 0x40,
    shift_right = 0x41,
    bank_id = 0x50,
    bank_section = 0x51,
    bank_current = 0x52,
    hram_check = 0x60,
    immediate_int = 0x80,
    immediate_id = 0x81
}

export default ExprType
