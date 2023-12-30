const router=require('express').Router()
const static=require('../controller/staticController')

router.get('/staticList',static.staticList)
router.put('/staticEdit',static.staticEdit)
router.post('/staticCreate',static.staticCreate)
router.delete('/staticDelete',static.staticDelete)

module.exports=router