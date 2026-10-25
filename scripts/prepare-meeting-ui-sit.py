import importlib.util,os
from pathlib import Path
os.environ['SCD_SIT_RUN']='20261025-A3'
spec=importlib.util.spec_from_file_location('sit','scripts/run-meeting-sit.py');sit=importlib.util.module_from_spec(spec);spec.loader.exec_module(sit)
def call(path,p=None,t=None):
 c,r=sit.request(path,p,t);assert c==200,(c,r);return r
a=call('/api/auth/login',{'userId':'sit-admin','password':sit.PASSWORD})['token'];d=call('/api/auth/login',{'userId':'sit-driver','password':sit.PASSWORD})['token'];h='SIT-UI-20261025'
call('/api/admin/job',{'houseNumber':h,'customerName':'SIT ONLY UI DEMO','driverId':'sit-driver','vehiclePlate':'SIT-TRUCK','pieceCount':2,'packageType':'Carton','pickupDate':'2026-10-25','destination':'WH3','routeType':'WH3','flightNo':'SIT100','flightTime':'2026-10-26T12:00:00Z'},a)
call('/api/jobs/cs-confirm',{'houseNumbers':[h],'invoiceNo':'SIT-UI-INVOICE','contactName':'SIT CONTACT','contactPhone':'0000000000'},a)
call('/api/admin/issue-cargo',{'houseNumber':h},a)
call('/api/meeting/settings',{'enabled':True,'geofencingEnabled':False,'queueMinutes':15,'acknowledgeExistingJobs':True},a)
call('/api/pickup/route-start',{'houseNumber':h,'houseNumbers':[h],'gpsLat':13.1,'gpsLong':100.1},d)
call('/api/pickup/checkin',{'houseNumber':h,'houseNumbers':[h],'gpsLat':13.1,'gpsLong':100.1},d)
print('SIT UI fixture ready; 2 CTN, arrived pickup only; no real cargo or production changes')
