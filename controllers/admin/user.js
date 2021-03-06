const jwt = require('jsonwebtoken');
const passport = require('passport');
const { ExpressError } = require('../../middleWare/error_handlers');

const User = require('../../models/user');

const expiryTime = 86400000;
const expiryDate = Date.now() + expiryTime;

module.exports = { expiryDate };

//const expressError = module.exports('../middleWare/error_handlers.js');

module.exports.signup = function (req, res) {
    res.json({
        user: req.user,
        message: res.message,
    });
};

module.exports.login = (req, res, next) => {
    passport.authenticate(
        'login',
        {
            session: false,
            failWithError: true,
        },
        (error, user, info) => {
            try {
                if (error || !user) {
                    next(new ExpressError(info.message, 404));
                    return; //important
                }
                req.login(
                    user,
                    {
                        session: false,
                    },
                    async (err) => {
                        if (err) return res.json(err);
                        const body = {
                            _id: user._id,
                            username: user.username,
                            role: user.role,
                        };
                        const token = jwt.sign(
                            {
                                user: body,
                            },
                            process.env.SECRET,
                            {
                                expiresIn: expiryTime,
                            },
                        );

                        let refreshToken = '';
                        (await user.refreshToken)
                            ? (refreshToken = user.refreshToken)
                            : (refreshToken = jwt.sign(
                                  { user: body },
                                  process.env.REFRESH_SECRET,
                              ));
                        await User.findOneAndUpdate(
                            {
                                username: user.username,
                            },
                            {
                                token,
                                refreshToken,
                                expiryDate,
                            },
                        );

                        res.json({
                            token,
                            refreshToken,
                            id: user._id,
                            username: user.username,
                            name: user.name,
                            role: user.role,
                            expiresIn: expiryTime,
                            expiryDate,
                            message: info.message,
                        });
                    },
                );
            } catch (err) {
                res.status(500).json({ message: 'Something went wrong' });
                return;
            }
        },
    )(req, res, next);
};

module.exports.refreshTokenGeneration = async (req, res, next) => {
    try {
        const { refreshToken } = req.body;
        const user = await User.findOne({ refreshToken });
        if (user.length === 0)
            return next(new ExpressError('User not found', 404));
        let token = '';
        if (user.expiryDate > Date.now()) {
            token = user.token;
        } else {
            const opts = {
                _id: user._id,
                username: user.username,
                role: user.role,
            };
            token = jwt.sign({ user: opts }, process.env.SECRET, {
                expiresIn: expiryTime,
            });
            const newExpiryDate = Date.now() + expiryTime;
            await User.findOneAndUpdate(
                { refreshToken },
                { token, expiryDate: newExpiryDate },
            );
        }
        return res.json({
            token,
            refreshToken,
            id: user._id,
            username: user.username,
            name: user.name,
            role: user.role,
            expiresIn: expiryTime,
            expiryDate,
        });
    } catch (_) {
        return next(new ExpressError('Failed to generate refresh token'));
    }
};

module.exports.logout = async (req, res, next) => {
    try {
        const { secret_token: token } = req.headers;
        const user = await User.findOneAndUpdate(
            { token },
            { token: null, fcmToken: null, expiryDate: null },
            { new: true },
        );
        if (!user) return next(new ExpressError("User doesn't exist"));
        return res.json({ message: 'User Logged Out!' });
    } catch (_) {
        return next(new ExpressError('Failed to Logout'));
    }
};
