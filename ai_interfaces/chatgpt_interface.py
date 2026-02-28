import openai
from file_utils import read_prompt_from_file

def query_chat_gpt():
    openai.api_key = 'YOUR API_KEY'
    prompt_file = 'Stock_Price_Prompt.txt'
    prompt = read_prompt_from_file(prompt_file)
    messages = [{"role": "system", "content":
        prompt}, {"role": "user", "content": 'system'}]
    chat = openai.ChatCompletion.create(model="gpt-5.2", messages=messages)
    reply = chat.choices[0].message.content
    return reply

if __name__ == '__main__':
    reply = query_chat_gpt()
    print(reply)