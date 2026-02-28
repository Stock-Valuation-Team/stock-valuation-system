from pathlib import Path


def read_prompt_from_file(file_path):
    root_folder = Path(__file__).parents[1]
    prompts_folder = root_folder / "prompts"
    file_path = prompts_folder / file_path
    content = file_path.read_text(encoding="utf-8")
    return content


if __name__ == '__main__':
    prompt_file_path = 'Analysts_Recommendation_Prompt.txt'
    file_content = read_prompt_from_file(prompt_file_path)
    print(file_content)
