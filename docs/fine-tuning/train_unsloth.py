"""
B6 fine-tuning run (Loop 2, Riya's first email). Runs on a free Colab T4 or a local 6 GB GPU (RTX 2060).

1. Upload seed/b6/out/train.chat.jsonl and test.prompts.jsonl next to this file (Colab: the Files pane).
2. pip install unsloth   (Colab: the first cell of any Unsloth notebook does this)
3. python train_unsloth.py
4. Copy finetuned.outputs.jsonl back to seed/b6/out/ and run: pnpm tsx scripts/b6/eval.ts D

Base model: Qwen2.5-1.5B-Instruct in 4-bit with LoRA, small enough for 6 GB and quick to train (~280 short rows).
Note: Colab is Google's infrastructure. The training file holds deck facts founders shared in confidence (names
are already masked as [F1]). Under the founder agreement, run it locally or train on the synthetic rows only.
"""
import json

from unsloth import FastLanguageModel
from unsloth.chat_templates import get_chat_template, train_on_responses_only
from datasets import load_dataset
from trl import SFTConfig, SFTTrainer

MAX_LEN = 1024
model, tokenizer = FastLanguageModel.from_pretrained("unsloth/Qwen2.5-1.5B-Instruct-bnb-4bit", max_seq_length=MAX_LEN, load_in_4bit=True)
model = FastLanguageModel.get_peft_model(model, r=16, lora_alpha=16, lora_dropout=0, target_modules=["q_proj", "k_proj", "v_proj", "o_proj", "gate_proj", "up_proj", "down_proj"], use_gradient_checkpointing="unsloth", random_state=3407)
tokenizer = get_chat_template(tokenizer, chat_template="qwen-2.5")

ds = load_dataset("json", data_files="train.chat.jsonl", split="train")
ds = ds.map(lambda b: {"text": [tokenizer.apply_chat_template(m, tokenize=False) for m in b["messages"]]}, batched=True)
split = ds.train_test_split(test_size=0.1, seed=3407)  # a small validation slice from TRAIN rows, to watch for overfitting

trainer = SFTTrainer(
    model=model, tokenizer=tokenizer, train_dataset=split["train"], eval_dataset=split["test"],
    args=SFTConfig(dataset_text_field="text", max_seq_length=MAX_LEN, per_device_train_batch_size=2, gradient_accumulation_steps=4,
                   num_train_epochs=3, learning_rate=2e-4, warmup_steps=5, logging_steps=5, eval_strategy="epoch",
                   optim="adamw_8bit", weight_decay=0.01, lr_scheduler_type="linear", seed=3407, output_dir="outputs", report_to="none"),
)
trainer = train_on_responses_only(trainer, instruction_part="<|im_start|>user\n", response_part="<|im_start|>assistant\n")
trainer.train()

# run the sealed test prompts blind and save the emails for the harness (variant D)
FastLanguageModel.for_inference(model)
with open("test.prompts.jsonl") as f, open("finetuned.outputs.jsonl", "w") as out:
    for line in f:
        row = json.loads(line)
        ids = tokenizer.apply_chat_template(row["messages"], add_generation_prompt=True, return_tensors="pt").to("cuda")
        gen = model.generate(input_ids=ids, max_new_tokens=200, temperature=0.4, do_sample=True)
        email = tokenizer.decode(gen[0][ids.shape[1]:], skip_special_tokens=True).strip()
        out.write(json.dumps({"id": row["id"], "email": email}) + "\n")
model.save_pretrained("riya-email-lora")  # the adapter only (~70 MB)
print("done: finetuned.outputs.jsonl and riya-email-lora/")
