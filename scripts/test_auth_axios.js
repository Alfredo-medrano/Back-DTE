const axios = require('axios');
const params = new URLSearchParams();
params.append('user', '070048272');
params.append('pwd', 'medranO2005');

const start = Date.now();
axios.post('https://apitest.dtes.mh.gob.sv/seguridad/auth', params, {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    timeout: 8000
}).then(res => {
    console.log('Success in', Date.now() - start, 'ms', res.data);
}).catch(err => {
    console.log('Error in', Date.now() - start, 'ms', err.message);
});
