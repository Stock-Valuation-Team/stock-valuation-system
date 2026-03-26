import csv
from pathlib import Path

def get_data_from_csv(filename):
    root_folder = Path(__file__).parents[1]
    file_name = root_folder / "data" / filename
    print ('loading data from csv file')
    data = []
    # Using 'with open()' ensures the file is closed automatically
    with open(file_name, mode='r', newline='', encoding='utf-8') as file:
        reader = csv.reader(file, delimiter=',')
        for row in reader:
            data.append(row)
    return data