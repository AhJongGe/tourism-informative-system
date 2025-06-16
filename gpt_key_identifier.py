import openai

openai.api_key = "OPENAI_API_KEY"  # your actual key here
models = openai.models.list()
for m in models.data:
    print(m.id)
