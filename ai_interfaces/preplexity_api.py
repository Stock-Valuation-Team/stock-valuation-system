from openai import OpenAI
from file_utils import read_prompt_from_file

API_KEY="YOUR_API_KEY"
model="sonar"

prompt_file = 'Analysts_Recommendation_Prompt.txt'
prompt = read_prompt_from_file(prompt_file)

messages = [
    {
        "role": "system",
        "content": prompt,
    },
    {
        "role": "user",
        "content": (
            prompt
        ),
    },
]

client = OpenAI(api_key=API_KEY, base_url="https://api.perplexity.ai")
response = client.chat.completions.create(
    model=model,
    messages=messages
)
print(response.choices[0].message.content)