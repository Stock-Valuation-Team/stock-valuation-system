import csv

def get_data_from_csv(filename):
    data_folder = '../data/'
    file_name = data_folder + filename
    print ('loading data from csv file')
    data = []
    # Using 'with open()' ensures the file is closed automatically
    with open(file_name, mode='r', newline='', encoding='utf-8') as file:
        reader = csv.reader(file, delimiter=',')
        for row in reader:
            data.append(row)
    return data