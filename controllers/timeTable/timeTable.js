const {
    Faculty,
    FacultyAssignment,
    Session,
    Subject,
} = require('../../models/timeTable');

const { cloudinary } = require('../../cloudinary');
const { ExpressError } = require('../../middleWare/error_handlers');
const helpers = require('../../middleWare/helpers.js');

module.exports.getAllSubjects = async (req, res, next) => {
    try {
        const Subjects = await Subject.find({})
            .populate('sessions')
            .populate({
                path: 'facultiesIncharge',
                populate: {
                    path: 'user',
                },
            });
        res.json(helpers.objectResponseWIthIdKey(Subjects));
    } catch (error) {
        next(new ExpressError());
        console.log(error);
    }
};

module.exports.getSubjectById = async (req, res, next) => {
    try {
        const { subjectId } = req.params;
        const foundSubject = await Subject.findById(subjectId);
        if (!foundSubject) {
            next(new ExpressError('Subject not found!!', 404));
        }
        res.json(foundSubject);
    } catch (error) {
        next(new ExpressError(error.message));
    }
};

module.exports.registerSubject = async (req, res, next) => {
    try {
        const { body, file } = req;
        const { subject, session, facultiesIncharge } = body;
        const newSubject = await new Subject(subject);
        facultiesIncharge.forEach((e) => {
            newSubject.facultiesIncharge.push(e);
        });
        newSubject.createdOn = new Date().toISOString();
        if (file) {
            newSubject.syllabusDocUrl = file.path;
            newSubject.syllabusDocFileName = file.filename;
            newSubject.syllabusDocOriginalName = file.originalname;
        }
        await session.forEach(async (e) => {
            const newSession = await new Session(e);
            newSession.subject = newSubject._id;
            newSession.createdOn = new Date().toISOString();
            newSubject.sessions.push(newSession);
            await newSession.save();
        });
        await newSubject.save();
        res.json({ message: 'Successfully Registered' });
    } catch (error) {
        next(new ExpressError(error.message));
    }
};

//In the below method, from the front end the whole schema should be pre-existing and old items to be kept as it is.
//Editing a session can also be sent to the same request url.
//New Session creation can also hit the same request url
module.exports.patchSubject = async (req, res, next) => {
    try {
        const { body, params, file } = req;
        const { subject, facultiesIncharge, session } = body;
        const { subjectId } = params;
        //below parameters to delete a particular session

        const editedSubject = await Subject.findByIdAndUpdate(
            subjectId,
            { ...subject },
            { new: true },
        );
        if (!editedSubject) {
            next(new ExpressError('Subject not found', 404));
        }

        if (session) {
            //Request should contain session id
            session.forEach(async (e) => {
                const existingSession = await Session.findById(e._id);
                if (!existingSession) {
                    const newSession = await new Session(e);
                    newSession.subject = editedSubject._id;
                    newSession.createdOn = new Date().toISOString();
                    //TODO: DO an alternative as it is one more query to the DB,
                    //NOTE: The below one was implemented because normal push wasn't working.
                    //await editedSubject.sessions.push(newSession);
                    await Subject.findOneAndUpdate(
                        { _id: subjectId },
                        { $push: { sessions: newSession } },
                    );
                    await newSession.save();
                } else {
                    existingSession.subject = e.subject;
                    existingSession.dateAndTime = e.dateAndTime;
                    existingSession.duration = e.duration;
                    existingSession.room = e.room;
                    existingSession.semester = e.semester;
                    existingSession.section = e.section;
                    existingSession.createdOn = e.createdOn;
                    existingSession.editedOn = new Date().toISOString();
                    await existingSession.save();
                }
            });
        }

        facultiesIncharge.forEach((e) => {
            if (!editedSubject.facultiesIncharge.includes(e)) {
                editedSubject.facultiesIncharge.push(e);
            }
        });

        if (file) {
            await cloudinary.uploader.destroy(
                editedSubject.syllabusDocFileName,
            );
            editedSubject.syllabusDocUrl = file.path;
            editedSubject.syllabusDocFileName = file.filename;
            editedSubject.syllabusDocOriginalName = file.originalname;
        }

        editedSubject.editedOn = new Date().toISOString();

        await editedSubject.save();

        res.json({ message: 'Updating Successful' });
    } catch (error) {
        next(new ExpressError(error.message));
    }
};

//Method to delete individual session inside the subject
module.exports.deleteSession = async (req, res, next) => {
    try {
        const { params } = req;
        const { sessionId } = params;
        //Deleting session logic

        if (!sessionId) {
            next(new ExpressError('No session Id provided.', 406));
        }
        const removedSession = await Session.findOneAndDelete({
            _id: sessionId,
        });

        if (!removedSession) {
            next(new ExpressError('Session not found.', 404));
        }

        const subject = await Subject.findById(removedSession.subject);
        subject.sessions = await subject.sessions.filter(
            (ele) => ele.toString() !== removedSession._id.toString(),
        );
        await subject.save();
        res.json({ message: 'Session deleted' });
    } catch (error) {
        next(new ExpressError(error.message));
    }
};

module.exports.deleteSubject = async (req, res, next) => {
    try {
        const { subjectId } = req.params;

        const removedSubject = await Subject.findOneAndDelete({
            _id: subjectId,
        });

        if (!removedSubject) {
            next(new ExpressError('Subject Not Found', 404));
        }

        await cloudinary.uploader.destroy(removedSubject.syllabusDocFileName);

        res.json({ removedSubject, message: 'Deleted Subject Successfully' });
    } catch (error) {
        next(new ExpressError(error.message));
    }
};

//This method will create the faculty information which includes the semester incharge info
//TODO: Move to separate file
module.exports.createFaculty = async (req, res, next) => {
    try {
        const { body, user } = req;
        const { faculty, facultyAssignments } = body;
        //console.log(facultyAssignments);
        const { _id: userId } = user;
        const newFaculty = await new Faculty(faculty);
        newFaculty.user = userId;

        await facultyAssignments.map(async (e) => {
            const newFacAss = await new FacultyAssignment(e);
            newFacAss.faculty = newFaculty._id;
            //console.log(newFacAss);
            newFaculty.facultyAssignments.push(newFacAss);
            newFaculty.createdOn = new Date().toISOString();
            await newFacAss.save();
        });

        newFaculty.createdOn = new Date().toISOString();

        await newFaculty.save();
        res.json({
            message: 'Successfully Registered',
        });
    } catch (error) {
        //console.log(error);
        next(new ExpressError());
    }
};

module.exports.getAllFaculty = async (req, res, next) => {
    try {
        const allFaculty = await Faculty.find({})
            .populate('user')
            .populate('facultyAssignments');
        res.json(helpers.objectResponseWIthIdKey(allFaculty));
    } catch (error) {
        next(new ExpressError(error.message));
    }
};

module.exports.getFacultyById = async (req, res, next) => {
    try {
        const { facultyId } = req.params;
        const faculty = await Faculty.findById(facultyId).populate(
            'facultyAssignments',
        );
        if (!faculty) {
            next(new ExpressError('Faculty not found.', 404));
        }

        res.json(faculty);
    } catch (error) {
        next(new ExpressError(error.message));
    }
};

module.exports.updateFaculty = async (req, res, next) => {
    try {
        const { body, params } = req;
        const { faculty, facultyAssignments } = body;
        const { facultyId } = params;

        const editedFaculty = await Faculty.findById(facultyId);

        if (!editedFaculty) {
            next(new ExpressError('Faculty not found.', 404));
        }

        editedFaculty.department = faculty.department;
        await facultyAssignments.forEach(async (ele) => {
            const foundFacAss = await FacultyAssignment.findById(ele._id);
            if (foundFacAss) {
                foundFacAss.assignedSemester = ele.assignedSemester;
                foundFacAss.assignedDepartment = ele.assignedDepartment;
                foundFacAss.assignedSection = ele.assignedSection;
                foundFacAss.assignmentType = ele.assignmentType;
                foundFacAss.createdOn = ele.createdOn;
                foundFacAss.editedOn = new Date().toISOString();
                await foundFacAss.save();
            } else {
                const newFacAss = await new FacultyAssignment(ele);
                newFacAss.faculty = editedFaculty._id;
                //console.log(newFacAss);
                newFacAss.createdOn = new Date().toISOString();
                await Faculty.findByIdAndUpdate(editedFaculty._id, {
                    $push: { facultyAssignments: newFacAss },
                });
                // editedFaculty.facultyAssignments.push(newFacAss);
                await newFacAss.save();
            }
        });
        editedFaculty.createdOn = faculty.createdOn;
        editedFaculty.editedOn = new Date().toISOString();
        await editedFaculty.save();
        res.json({ editedFaculty, message: 'Edited successfully' });
    } catch (error) {
        next(new ExpressError(error.message));
    }
};

module.exports.deleteFacultyAssignment = async (req, res, next) => {
    try {
        const { params } = req;
        const { facultyAssignmentId } = params;
        if (!facultyAssignmentId) {
            next(new ExpressError('No faculty Id provided.', 406));
        }

        const removedFacultyAssignment =
            await FacultyAssignment.findOneAndDelete({
                _id: facultyAssignmentId,
            });

        if (!removedFacultyAssignment) {
            next(new ExpressError('Assignment not found.', 404));
        }

        const faculty = await Faculty.findById(
            removedFacultyAssignment.faculty,
        );

        faculty.facultyAssignments = await faculty.facultyAssignments.filter(
            (ele) => ele.toString() !== removedFacultyAssignment._id.toString(),
        );
        await faculty.save();

        res.json({ message: 'Deleted faculty assignment, successfully' });
    } catch (error) {
        next(new ExpressError(error.message));
    }
};

module.exports.deleteFaculty = async (req, res, next) => {
    try {
        const { facultyId } = req.params;

        const removedFaculty = await Faculty.findOneAndDelete({
            _id: facultyId,
        });
        if (!removedFaculty) {
            next(new ExpressError('Faculty Not Found', 404));
        }

        res.json(removedFaculty);
    } catch (error) {
        next(new ExpressError(error.message));
    }
};
