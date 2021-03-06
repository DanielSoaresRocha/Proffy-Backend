import db from '../database/connections'
import convertHourToMinutes from '../utils/convertHourToMinutes'
import { Request, Response } from 'express'

interface ScheduleItem {
    week_day: number
    from: string
    to: string
}

interface Filters {
    week_day: string
    subject: string
    time: string
}

export default class ClassesController {
    async index (request: Request, response: Response) {
        let filters = request.query

        const week_day = filters.week_day as string
        const subject = filters.subject as string
        const time = filters.time as string

        if (!filters.week_day || !filters.subject || !filters.time) {
            return response.status(400).json({
                error: 'Missing filters to search classes'
            })
        }

        const timeInMinutes = convertHourToMinutes(time)

        const classes = await db('classes')
            .whereExists(function () {
                this.select('class_schedule.*')
                    .from('class_schedule')
                    .whereRaw('`class_schedule`.`class_id` = `classes`.`id`')
                    .whereRaw('`class_schedule`.`week_day` = ??', [Number(week_day)])
                    .whereRaw('`class_schedule`.`from` <= ??', [timeInMinutes])
                    .whereRaw('`class_schedule`.`to` > ??', [timeInMinutes])
            })
            .where('classes.subject', '=', subject)
            .join('users', 'classes.user_id', '=', 'users.id')
            .select(['classes.*', 'users.*'])
        response.json(classes)
    }

    async create (request: Request, response: Response) {
        const {
            name,
            avatar,
            bio,
            whatsapp,
            subject,
            cost,
            schedule,
        } = request.body

        const trx = await db.transaction()

        try {
            const [user_id] = await trx('users').insert({
                name,
                avatar,
                whatsapp,
                bio
            })

            const [class_id] = await trx('classes').insert({
                subject,
                cost,
                user_id
            })

            const classSchedule = schedule.map((scheduleItem: ScheduleItem) => {
                return {
                    class_id,
                    week_day: scheduleItem.week_day,
                    from: convertHourToMinutes(scheduleItem.from),
                    to: convertHourToMinutes(scheduleItem.to)
                }
            })

            await trx('class_schedule').insert(classSchedule)

            await trx.commit()

            return response.status(201).send()
        } catch (e) {
            await trx.rollback()

            return response.status(400).json({
                error: 'Unexpected error while creating new class'
            })
        }
    }
}