use stacky::{Interpreter, Script};
use wasm_bindgen::prelude::wasm_bindgen;

#[wasm_bindgen]
pub fn run(source: String) -> String {
    console_error_panic_hook::set_once();

    let script = match Script::from_str(&source) {
        Ok(script) => script,
        Err(e) => {
            let mut msg = String::new();
            for err in e.inner() {
                msg.push_str(&format!("{}\n", err));
            }
            return format!("{}", msg);
        }
    };

    let mut output_buffer = Vec::new();
    {
        let mut interpreter = Interpreter::new()
            .with_output(&mut output_buffer)
            .with_max_stack_size(100)
            .with_max_execution_time(500);

        match interpreter.run(&script, &[]) {
            Ok(_) => {}
            Err(e) => return format!("{}", e),
        }
    }

    String::from_utf8(output_buffer).unwrap()
}
