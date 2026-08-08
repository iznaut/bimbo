import _ from "lodash"
import moment from "moment"
import * as feather from "feather-icons"

// TODO copy over to user data and load dynamically

export default {
    formatDate: function (date, format) {
        return moment(date).utc().format(format)
    },
    getIcon: function (name, options) {
        let icon = feather.icons[name]
        icon.attrs = { ...icon.attrs, ...options.hash }
        return icon.toSvg()
    },
    useFirstValid: function () {
        // TODO get rid of this
        const valid = _.filter(arguments, (arg) => {
            return _.isString(arg)
        })

        return valid[0]
    },
    isCollectionSortAscending: function (name, key, options) {
        const SORTS = _.find(
            options.data.root._project_meta.collections, // options.data.root == all page data
            (v) => v.name == name,
        ).sort

        const ORDER = _.find(SORTS, (v) => v.key == key).order

        return ORDER == "ascending"
    },
}
