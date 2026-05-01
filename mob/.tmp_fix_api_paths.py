from pathlib import Path

path = Path('services/api.ts')
text = path.read_text(encoding='utf-8')
replacements = [
    ("axios.post('/login'", "axios.post('login'"),
    ("apiClient.post('/logout'", "apiClient.post('logout'"),
    ("apiClient.get('/me'", "apiClient.get('me'"),
    ("apiClient.get('/branches'", "apiClient.get('branches'"),
    ("apiClient.get('/products'", "apiClient.get('products'"),
    ("apiClient.get('/staff'", "apiClient.get('staff'"),
    ("apiClient.get('/attendance'", "apiClient.get('attendance'"),
    ("apiClient.get('/sales'", "apiClient.get('sales'"),
    ("apiClient.post('/staff'", "apiClient.post('staff'"),
    ("apiClient.put('/staff/", "apiClient.put('staff/"),
    ("apiClient.delete('/staff/", "apiClient.delete('staff/"),
    ("apiClient.put('/attendance/", "apiClient.put('attendance/"),
    ("apiClient.post('/attendance/time-in'", "apiClient.post('attendance/time-in'"),
    ("apiClient.get('/attendance/payroll/report'", "apiClient.get('attendance/payroll/report'"),
    ("apiClient.get('/sales/summary/overview'", "apiClient.get('sales/summary/overview'"),
]
for old, new in replacements:
    text = text.replace(old, new)
path.write_text(text, encoding='utf-8')
print('Updated file with relative request paths')
